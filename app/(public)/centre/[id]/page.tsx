import { redirect } from 'next/navigation'

export default async function PharmacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/?pharmacy=${encodeURIComponent(id)}`)
}
