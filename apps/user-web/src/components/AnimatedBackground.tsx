export function AnimatedBackground() {
  return (
    <div 
      className="fixed inset-0 z-0 bg-primary-container pointer-events-none"
      style={{
        backgroundImage: 'url(/bg-vintage.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 0.9,
        mixBlendMode: 'luminosity'
      }}
    >
      {/* Dark overlay to ensure text is readable */}
      <div className="absolute inset-0 bg-primary-container/80 backdrop-blur-[2px]"></div>
    </div>
  );
}
