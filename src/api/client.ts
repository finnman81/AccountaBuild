import axios from 'axios';

// The base URL for our local API.
// For Android emulator, this is the special address to access the host machine's localhost.
// For iOS simulator, it would typically be 'http://localhost:5001/api'.
// We'll add logic to handle this dynamically later if needed.
const baseURL = 'http://10.0.2.2:5001/api';

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient; 