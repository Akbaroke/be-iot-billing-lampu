import express from 'express';
import mqtt from 'mqtt';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import cron from 'node-cron';

dotenv.config();
const app = express();

const { CLIENT_URL, SERVER_PORT, MQTT_USERNAME, MQTT_PASSWORD } = process.env;
const validNumbers = [1, 2, 3, 4];

app.use(cors({ credentials: true, origin: CLIENT_URL }));

// MQTT
const protocol = 'mqtt';
const host = 'broker.emqx.io';
const port = '1883';
const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;
const topic = 'lampu';

const connectUrl = `${protocol}://${host}:${port}`;

const mqtt_client = mqtt.connect(connectUrl, {
  clientId,
  clean: true,
  connectTimeout: 4000,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  reconnectPeriod: 1000,
});

// mqtt_client.on('connect', () => {
//   console.log('Connected');
//   mqtt_client.subscribe([topic], () => {
//     console.log(`Subscribe to topic '${topic}'`);
//   });
// });

// mqtt_client.on('message', (topic, payload) => {
//   console.log('Received Message:', topic, payload.toString());
// });

app.use(function (req, res, next) {
  req.mqttPublish = function (topic, message) {
    mqtt_client.publish(topic, message);
  };

  next();
});

app.use(express.json());

app.get('/', async (req, res) => {
  res
    .json({
      status: 'success',
      message: 'Server sedang berjalan.',
      data: {
        get: ['/', '/data', '/data:number'],
        post: ['/lampu', '/waktu', '/stop'],
        delete: ['/reset'],
      },
    })
    .status(200);
});

app.get('/data', async (req, res) => {
  try {
    const rawData = fs.readFileSync('../data.json');
    const jsonData = JSON.parse(rawData);

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
    const rawData = fs.readFileSync('../data.json');
    const jsonData = JSON.parse(rawData);
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

    res
      .json({
        status: 'success',
        message: `${status ? 'Menyalakan' : 'Mematikan'} ${
          number === 0 ? 'Semua Lampu' : 'Lampu No.' + number
        }`,
        data: null,
      })
      .status(200);
  } catch (error) {
    console.error('Error in MQTT operation:', error);
    res
      .json({
        status: 'failed',
        message: 'Server bermasalah.',
        data: null,
      })
      .status(500);
  }
});

app.post('/waktu', async (req, res) => {
  const { number, addTime } = req.body;
  try {
    // Validasi nomor
    if (!validNumbers.includes(number)) {
      return res
        .json({
          status: 'failed',
          message: 'Nomor tidak valid.',
          data: null,
        })
        .status(400);
    }

    // Baca data dari file JSON
    const rawData = fs.readFileSync('../data.json');
    const jsonData = JSON.parse(rawData);

    // Cek apakah nomor sudah ada di data.json
    const index = jsonData.findIndex((item) => item.number === number);
    const datetime = new Date();
    if (index !== -1) {
      // Jika sudah ada, update waktu
      const expiredDate = new Date(jsonData[index].expired_at);
      expiredDate.setMinutes(expiredDate.getMinutes() + addTime);

      jsonData[index].expired_at = expiredDate.getTime(); // Ubah kembali ke milidetik

      res
        .json({
          status: 'success',
          message: `Menambah waktu ${addTime} menit berhasil.`,
          data: jsonData,
        })
        .status(201);
    } else {
      // Jika belum, tambahkan data baru
      const startAt = datetime.getTime();
      const expiredAt = new Date(startAt);
      expiredAt.setMinutes(expiredAt.getMinutes() + addTime);

      jsonData.push({
        number,
        start_at: startAt,
        expired_at: expiredAt.getTime(), // Ubah kembali ke milidetik
      });

      res
        .json({
          status: 'success',
          message: `Memulai waktu ${addTime} menit berhasil.`,
          data: jsonData,
        })
        .status(201);
    }

    await req.mqttPublish(topic, `{ "number": ${number}, "status": true }`);

    // Simpan data kembali ke file JSON
    fs.writeFileSync('../data.json', JSON.stringify(jsonData));
  } catch (error) {
    console.error('Error:', error);
    res
      .json({
        status: 'failed',
        message: 'Gagal menginputkan waktu.',
        data: null,
      })
      .status(400);
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

    // Baca data dari file JSON
    const rawData = fs.readFileSync('../data.json');
    const jsonData = JSON.parse(rawData);

    // Temukan lampu dengan nomor yang sesuai dan hapus dari data.json
    const index = jsonData.findIndex((item) => item.number === number);
    if (index !== -1) {
      jsonData.splice(index, 1);

      // Simpan data terbaru ke file JSON setelah menghapus lampu yang akan dihentikan
      fs.writeFileSync('../data.json', JSON.stringify(jsonData));

      // Matikan lampu
      req.mqttPublish(topic, `{ "number": ${number}, "status": false }`);

      return res.status(200).json({
        status: 'success',
        message: `Berhasil menghentikan waktu lampu No.${number}`,
        data: null,
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
    // Hapus semua data.json
    fs.writeFileSync('../data.json', '[]');

    // Matikan semua lampu
    req.mqttPublish(topic, `{ "number": 0, "status": false }`);

    res.status(200).json({
      status: 'success',
      message: 'Sistem berhasil direset.',
      data: null,
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

// Cronjob
cron.schedule('* * * * *', () => {
  // Mengecek semua expired lampu
  const rawData = fs.readFileSync('../data.json');
  let jsonData = JSON.parse(rawData);
  const currentTimestamp = new Date().getTime();

  // Buat array baru untuk menyimpan data yang tidak kadaluarsa
  const updatedData = [];

  try {
    jsonData.forEach((lamp) => {
      if (lamp.expired_at <= currentTimestamp) {
        console.log(`Lampu No.${lamp.number} telah kadaluwarsa.`);

        // Mematikan lampu yang sudah expired
        mqtt_client.publish(
          topic,
          `{ "number": ${lamp.number}, "status": false }`
        );

        // Lampu telah kadaluwarsa, tidak perlu dimasukkan ke dalam updatedData
      } else {
        // Lampu masih aktif, masukkan ke dalam updatedData
        updatedData.push(lamp);
      }
    });

    // Simpan data yang diperbarui ke file JSON
    fs.writeFileSync('../data.json', JSON.stringify(updatedData));
  } catch (error) {
    console.log(error);
  }
});

app.listen(SERVER_PORT, () =>
  console.log(`Server running at port:${SERVER_PORT}`)
);
