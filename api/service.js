import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const { DATABASE_URL } = process.env;

// Fungsi untuk membuat data baru
async function createData(newData) {
  try {
    const { data } = await axios.post(DATABASE_URL, newData);
    return data;
  } catch (error) {
    console.error('Error creating data:', error);
    return null;
  }
}

// Fungsi untuk mendapatkan data
async function getData(id) {
  try {
    const { data } = await axios.get(
      id ? `${DATABASE_URL}/${id}` : DATABASE_URL
    );
    return data;
  } catch (error) {
    console.error('Error getting data:', error);
    return null;
  }
}

// Fungsi untuk memperbarui data berdasarkan ID
async function updateData(id, updatedData) {
  try {
    const { data } = await axios.put(`${DATABASE_URL}/${id}`, updatedData);
    return data;
  } catch (error) {
    console.error('Error updating data:', error);
    return null;
  }
}

// Fungsi untuk menghapus data by id
async function deleteData(id) {
  try {
    const { data } = await axios.delete(`${DATABASE_URL}/${id}`);
    return data;
  } catch (error) {
    console.error('Error deleting data:', error);
    return null;
  }
}

// Fungsi untuk menghapus semua data
async function deleteAllData() {
  try {
    const { data } = await axios.get(DATABASE_URL);
    const deletePromises = data.map(async (element) => {
      await axios.delete(`${DATABASE_URL}/${element.id}`);
    });
    await Promise.all(deletePromises);
    return 'All data deleted successfully';
  } catch (error) {
    console.error('Error deleting data:', error);
    return null;
  }
}

export { createData, getData, updateData, deleteData, deleteAllData };
