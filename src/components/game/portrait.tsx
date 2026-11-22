import p0 from '@/assets/portrait-0.jpg';
import p1 from '@/assets/portrait-1.jpg';
import p2 from '@/assets/portrait-2.jpg';
import p3 from '@/assets/portrait-3.jpg';
import p4 from '@/assets/portrait-4.jpg';
import p5 from '@/assets/portrait-5.jpg';
export const portraitImages = [p0,p1,p2,p3,p4,p5];
export function Portrait({ index, className = '' }: { index: number; className?: string }) {
  return <img className={`character-portrait ${className}`} src={portraitImages[index] ?? p0} alt={`Character portrait ${index + 1}`} width={512} height={512} />;
}
