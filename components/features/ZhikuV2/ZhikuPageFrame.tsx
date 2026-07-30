interface ZhikuPageFrameProps {
  brightness?: number;
  dimmer?: number;
  showGrid?: boolean;
  showSafeArea?: boolean;
}

export function ZhikuPageFrame({
  brightness = 0.78,
  dimmer = 0.24,
  showGrid = false,
  showSafeArea = false,
}: ZhikuPageFrameProps) {
  return (
    <>
      <img
        className="zhiku-v2-screen__background"
        src="/assets/zhiku/zhiku-archive-hall-background-concept-v3.webp"
        alt=""
        style={{ filter: `brightness(${brightness})` }}
      />
      <div className="zhiku-v2-screen__dimmer" style={{ opacity: dimmer }} />
      <div className="zhiku-v2-screen__texture" />
      {showGrid && <div className="zhiku-v2-screen__grid" aria-hidden="true" />}
      {showSafeArea && <div className="zhiku-v2-screen__safe-area" aria-hidden="true" />}
      <span className="zhiku-v2-screen__pin zhiku-v2-screen__pin--top-right" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="zhiku-v2-screen__pin zhiku-v2-screen__pin--bottom-left" aria-hidden="true">
        <i />
        <i />
      </span>
    </>
  );
}
