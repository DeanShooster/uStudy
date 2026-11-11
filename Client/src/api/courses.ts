import useSWR from 'swr'
import { z } from 'zod'
import { COURSE_ROUTES } from '../constants/constants'
import { setTopicProgress, userTopicsSchema } from './auth'
import { api, get } from './api'

const categoriesResponseSchema = z.object({
  categories: z.array(z.string()),
})

const topicSchema = z.object({
  name: z.string(),
})

const subjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  topics: z.array(topicSchema).default([]),
})

const courseSchema = z.object({
  name: z.string(),
  category: z.string(),
  subjects: z.array(subjectSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const coursesResponseSchema = z.object({
  courses: z.array(courseSchema),
})

export type Course = z.infer<typeof courseSchema>

function readCategories(url: string) {
  return get(url).then((data) => categoriesResponseSchema.parse(data).categories)
}

function readCourses(url: string) {
  return get(url).then((data) => coursesResponseSchema.parse(data).courses)
}

export function useCategories() {
  return useSWR(COURSE_ROUTES.categories, readCategories)
}

export function useCourses(category: string) {
  return useSWR(category ? COURSE_ROUTES.byCategory(category) : null, readCourses)
}

const progressResponseSchema = z.object({
  topics: userTopicsSchema,
})

async function saveTopics(data: unknown) {
  const topics = progressResponseSchema.parse(data).topics
  await setTopicProgress(topics)
}

export async function completeTopics(name: string) {
  const { data } = await api.post(COURSE_ROUTES.complete(name))
  await saveTopics(data)
}

export async function removeTopics(name: string) {
  const { data } = await api.delete(COURSE_ROUTES.remove(name))
  await saveTopics(data)
}
