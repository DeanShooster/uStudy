import { Link } from 'react-router'
import { categoryImages } from '../../assets'
import { useCategories } from '../../api/courses'
import Shell from '../../components/Shell'
import { dictionary } from '../../dictionary/dictionary'
import './Courses.scss'

export default function Courses() {
  const { data: categories = [], error } = useCategories()

  return (
    <Shell>
      <main className="courses">
        <h1>{dictionary.courses.title}</h1>
        {error ? (
          <p className="courses-status">{dictionary.courses.loadFailed}</p>
        ) : (
          <ul className="category-grid">
            {categories.map((category) => (
              <li key={category}>
                <Link to={`/courses/${category}`}>
                  <img src={categoryImages[category]} alt="" decoding="async" />
                  <span>{category}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  )
}
