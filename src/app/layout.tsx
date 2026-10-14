import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dobot Magician 4-DOF Simulator | DobotStudio Web',
  description: 'High-fidelity 3D client-side Dobot Magician robotic arm simulator with forward/inverse kinematics, object placement, and teaching playback.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full w-full overflow-hidden bg-dobot-bg text-dobot-text antialiased">
        {children}
      </body>
    </html>
  );
}
