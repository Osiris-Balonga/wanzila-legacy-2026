import type { Metadata, Viewport } from "next"
import "./globals.css"
import "./wanzila.css"

export const metadata: Metadata = {
  title: "Wanzila — Pharmacies à Brazzaville",
  description: "Recherchez une pharmacie à Brazzaville et affichez un itinéraire routier sur la carte.",
  keywords: "pharmacie, Brazzaville, itinéraire",
  authors: [{ name: "Wanzila" }],
  icons: { icon: "/brand-app-icon.png", apple: "/brand-app-icon.png" },
  robots: "index, follow",
  openGraph: {
    title: "Wanzila — Pharmacies à Brazzaville",
    description: "Recherchez une pharmacie et affichez un itinéraire routier.",
    type: "website",
    locale: "fr_FR",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="font-sans">
        {children}
      </body>
    </html>
  )
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }
