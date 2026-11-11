import { Route, Routes } from 'react-router'
import Category from './modules/Courses/Category'
import Courses from './modules/Courses/Courses'
import Topic from './modules/Courses/Topic'
import Home from './modules/Home/Home'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/courses" element={<Courses />} />
      <Route path="/courses/:category" element={<Category />} />
      <Route path="/courses/:category/:topic" element={<Topic />} />
    </Routes>
  )
}
