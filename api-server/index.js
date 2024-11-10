const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.API_SERVER_PORT;
const SOCKET_PORT = process.env.SOCKET_PORT;

const subscriber = new Redis('');
const io = new Server({ cors: '*' });

io.on('connection', socket => {
  socket.on('subscribe', channel => {
    socket.join(channel);
    socket.emit('message', `Joined ${channel}`);
  });
});

io.listen(SOCKET_PORT, () => {
  console.log('Socket Server on', SOCKET_PORT);
})

const ecsClient = new ECSClient({
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
  }
});

const config = {
  CLUSTUR: process.env.CLUSTER,
  TASK: process.env.TASK,
}

app.use(express.json());

app.post('/project', async (req, res) => {
  const { gitURL, slug } = req.body;
  const projectSlug = slug ? slug : generateSlug();

  // spin the container
  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: 'FARGATE',
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        subnets: [process.env.SUBNET_1, process.env.SUBNET_2, process.env.SUBNET_3],
        securityGroups: [process.env.SECURITY_GROUPS]
      }
    },
    overrides: {
      containerOverrides: [{
        name: 'builder-image',
        environment: [
          { name: 'GIT_REPOSITORY__URL', value: gitURL },
          { name: 'PROJECT_ID', value: projectSlug }
        ]
      }]
    }

  });

  await ecsClient.send(command);
  return res.json({
    status: 'queued',
    data: {
      projectSlug,
      url: `http://${projectSlug}.localhost:8000`
    }
  });

});

async function initRedisSubscribe() {
  console.log('Subscribed to logs...');
  subscriber.psubscribe('logs:*');
  subscriber.on('pmessage', (pattern, channel, message) => {
    io.to(channel).emit('message', message);
  });
}

initRedisSubscribe();

app.listen(PORT, () => {
  console.log(`API server is running on ${PORT}`);
});
