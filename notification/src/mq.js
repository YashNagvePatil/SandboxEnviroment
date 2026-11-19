import amqplib from "amqplib";

export const QUEUE = "auth_notification_queue";

let channel = null;

try {
  const mqUrl = process.env.RABBITMQ_URL || process.env.RABITMQ_URL;
  if (!mqUrl) {
    console.warn("RABBITMQ_URL not set, MQ consumer disabled");
  } else {
    const connection = await amqplib.connect(mqUrl);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE, { durable: true });
    console.log("RabbitMQ connected, queue ready:", QUEUE);
  }
} catch (error) {
  console.error("RabbitMQ connection error:", error.message);
}

export { channel };
