import axios from 'axios'
import { SERVER_URL, TOKEN_KEY } from '../constants/constants'

export const api = axios.create({
  baseURL: SERVER_URL,
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export async function get(url: string) {
  const { data } = await api.get(url)
  return data
}
