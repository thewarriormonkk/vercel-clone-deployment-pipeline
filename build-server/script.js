const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const {S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const Redis = require('ioredis');

const publisher = new Redis('');


const s3Client = new S3client({
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
  }
});

const PROJECT_ID = process.env.PROJECT_ID;

function publishLog(log) {
  publisher.publish(`logs: ${PROJECT_ID}`, JSON.stringify({ log }));
}

async function init() {
  console.log('Executing script.js');
  publishLog('Build Started...');
  const outDirPath = path.join(__dirname, 'output');

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);
  p.stdout.on('data', function (data) {
    console.log(data.toString());
    publishLog(data.toString());
  });

  p.stdout.on('error', function (data) {
    console.log('Error', data.toString());
    publishLog(`Error: ${data.toString()}`);
  });

  p.on('close', function () {
    console.log('Build complete');
    publishLog('Build Complete');
    const distFolderPath = path.join(__dirname, 'output', 'dist');
    const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

    publishLog('Starting to upload');
    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log('uploading', filepath);
      publishLog(`uploading ${file}`);

      const command = new PutObjectCommand({
        Bucket: process.env.BUCKET,
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filepath),
        ContentType: mime.lookup(filePath);
      });

      await s3Client.send(command);
      publishLog(`uploaded ${file}`);
      console.log('uploaded', filePath);
    }

    publishLog('Done');
    console.log('Done...');
  });
}

init();
