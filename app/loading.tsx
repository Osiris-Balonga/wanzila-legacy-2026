import Image from 'next/image'

export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-white px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/brand-app-icon.png" width={72} height={72} alt="Wanzila" priority />
        <p className="text-sm text-slate-600">Chargement de la carte…</p>
      </div>
    </div>
  )
}
