import express from 'express';
import mqtt from 'mqtt';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import {
  createData,
  deleteAllData,
  deleteData,
  getData,
  updateData,
} from './service.js';

dotenv.config();
const app = express();

const { SERVER_PORT, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TOPIC } = process.env;
const validNumbers = [1, 2, 3, 4];

app.use(cors({ credentials: true, origin: '*' }));

// MQTT
const protocol = 'mqtt';
const host = 'broker.emqx.io';
const port = '1883';
const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;
const topic = MQTT_TOPIC;

const connectUrl = `${protocol}://${host}:${port}`;

const mqtt_client = mqtt.connect(connectUrl, {
  clientId,
  clean: true,
  connectTimeout: 4000,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  reconnectPeriod: 1000,
});

app.use(function (req, res, next) {
  req.mqttPublish = function (topic, message) {
    mqtt_client.publish(topic, message);
  };
  console.log('Action To MQTT');

  next();
});

app.use(express.json());

app.get('/', async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server sedang berjalan.',
    data: {
      get: ['/', '/data', '/data:number'],
      post: ['/lampu', '/waktu', '/stop'],
      delete: ['/reset'],
    },
  });
});

app.get('/data', async (req, res) => {
  try {
    const jsonData = await getData();

    res.status(200).json({
      status: 'success',
      message: 'Berhasil mendapatkan semua data.',
      data: jsonData,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'failed',
      message: 'Gagal mendapatkan semua data.',
      data: null,
    });
  }
});

app.get('/data/:number', async (req, res) => {
  const { number } = req.params;
  try {
    const jsonData = await getData();
    const lampData = jsonData.find((lamp) => lamp.number === parseInt(number));

    if (lampData) {
      res.status(200).json({
        status: 'success',
        message: `Berhasil mendapatkan data untuk lampu No.${number}`,
        data: lampData,
      });
    } else {
      res.status(404).json({
        status: 'failed',
        message: `Data untuk lampu No.${number} tidak ditemukan.`,
        data: null,
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'failed',
      message: `Gagal mendapatkan data untuk lampu No.${number}`,
      data: null,
    });
  }
});

app.post('/lampu', async (req, res) => {
  const { number, status } = req.body;
  try {
    await req.mqttPublish(
      topic,
      `{ "number": ${number}, "status": ${status} }`
    );

    res.status(200).json({
      status: 'success',
      message: `${status ? 'Menyalakan' : 'Mematikan'} ${
        number === 0 ? 'Semua Lampu' : 'Lampu No.' + number
      }`,
      data: null,
    });
  } catch (error) {
    console.error('Error in MQTT operation:', error);
    res.status(500).json({
      status: 'failed',
      message: 'Server bermasalah.',
      data: null,
    });
  }
});

app.post('/waktu', async (req, res) => {
  const { number, addTime } = req.body;
  try {
    // Validasi nomor
    if (!validNumbers.includes(number)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Nomor tidak valid.',
        data: null,
      });
    }

    // Baca database
    const jsonData = await getData();

    // Cek apakah nomor sudah ada di data.json
    const index = jsonData.findIndex((item) => item.number === number);
    const datetime = new Date();
    if (index !== -1) {
      // Jika sudah ada, update waktu
      const expiredDate = new Date(jsonData[index].expired_at);
      expiredDate.setMinutes(expiredDate.getMinutes() + addTime);

      // simpan ke database
      const response = await updateData(jsonData[index].id, {
        expired_at: expiredDate.getTime(),
      });

      res.status(201).json({
        status: 'success',
        message: `Menambah waktu ${addTime} menit berhasil.`,
        data: response,
      });
    } else {
      // Jika belum, tambahkan data baru
      const startAt = datetime.getTime();
      const expiredAt = new Date(startAt);
      expiredAt.setMinutes(expiredAt.getMinutes() + addTime);

      // simpan ke database
      const response = await createData({
        number,
        start_at: startAt,
        expired_at: expiredAt.getTime(),
      });

      res.status(201).json({
        status: 'success',
        message: `Memulai waktu ${addTime} menit berhasil.`,
        data: response,
      });
    }

    await req.mqttPublish(topic, `{ "number": ${number}, "status": true }`);
  } catch (error) {
    console.error('Error:', error);
    res.status(400).json({
      status: 'failed',
      message: 'Gagal menginputkan waktu.',
      data: null,
    });
  }
});

app.post('/stop', async (req, res) => {
  const { number } = req.body;
  try {
    // Validasi nomor
    if (!validNumbers.includes(number)) {
      return res.status(400).json({
        status: 'failed',
        message: 'Nomor tidak valid.',
        data: null,
      });
    }

    // Baca database
    const jsonData = await getData();

    // Temukan lampu dengan nomor yang sesuai dan hapus dari data.json
    const index = jsonData.findIndex((item) => item.number === number);
    if (index !== -1) {
      // Simpan delete data number
      const response = await deleteData(jsonData[index].id);

      // Matikan lampu
      req.mqttPublish(topic, `{ "number": ${number}, "status": false }`);

      return res.status(200).json({
        status: 'success',
        message: `Berhasil menghentikan waktu lampu No.${number}`,
        data: response,
      });
    } else {
      return res.status(400).json({
        status: 'failed',
        message: `Tidak ada lampu dengan nomor ${number} dalam data.`,
        data: null,
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      status: 'failed',
      message: `Gagal menghentikan waktu lampu No.${number}`,
      data: null,
    });
  }
});

app.delete('/reset', async (req, res) => {
  try {
    // Hapus semua database
    const response = await deleteAllData();

    // Matikan semua lampu
    req.mqttPublish(topic, `{ "number": 0, "status": false }`);

    res.status(200).json({
      status: 'success',
      message: 'Sistem berhasil direset.',
      data: response,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'failed',
      message: 'Gagal mereset sistem.',
      data: null,
    });
  }
});

// Cronjob untuk setiap 20 detik
const scheduleTask = async () => {
  // Mengecek semua expired lampu
  const jsonData = await getData();
  const currentTimestamp = new Date().getTime();

  try {
    jsonData.map(async (lamp) => {
      if (lamp.expired_at <= currentTimestamp) {
        console.log(`Lampu No.${lamp.number} telah kadaluwarsa.`);

        // Mematikan lampu yang sudah expired
        mqtt_client.publish(
          topic,
          `{ "number": ${lamp.number}, "status": false }`
        );
        console.log('Action To MQTT');

        // Lampu telah kadaluwarsa dihapus dari database
        await deleteData(lamp.id);
      }
    });
  } catch (error) {
    console.log(error);
  }
};

// Menjalankan setiap menit
cron.schedule('* * * * *', async () => {
  await scheduleTask();
  // Menjalankan lagi setelah 10 detik
  setTimeout(scheduleTask, 20000);
});

app.listen(SERVER_PORT, () =>
  console.log(`Server running at port:${SERVER_PORT}`)
);
