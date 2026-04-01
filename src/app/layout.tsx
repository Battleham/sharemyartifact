import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShareMyArtifact — Share AI-generated dashboards',
  description: 'Upload an HTML artifact, get a shareable link. Full JavaScript execution, unrestricted API access.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
