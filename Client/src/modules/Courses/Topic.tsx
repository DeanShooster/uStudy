import { useParams } from 'react-router'
import ProgressBar from '../../components/ProgressBar'
import Shell from '../../components/Shell'
import { useUser } from '../../context/UserContext'
import { topicProgress } from '../../utils/progress'
import './Courses.scss'

export default function Topic() {
  const { topic = '' } = useParams()
  const { user } = useUser()
  const progress = topicProgress(user?.topics, topic)

  return (
    <Shell>
      <main className="courses">
        <h1>{topic}</h1>
        {progress === undefined ? null : <ProgressBar className="progress-bar-page" progress={progress} />}
      </main>
    </Shell>
  )
}
