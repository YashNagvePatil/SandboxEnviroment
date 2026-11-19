import amqplib from 'amqplib';

const QUEUE = 'auth_notification_queue';

let channel = null;

export async function connectMQ() {
  try {
    const connection = await amqplib.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE, { durable: true });
    console.log("RabbitMQ connected, queue ready:", QUEUE);
  } catch (error) {
    console.error("RabbitMQ connection error:", error.message);
    console.log("Auth service will continue without MQ (notifications disabled)");
  }
}

export async function sendAuthNotification(message) {
  if (!channel) {
    console.warn("MQ channel not available, skipping notification");
    return;
  }
  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });
}
