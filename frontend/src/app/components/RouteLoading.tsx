import BrandLogo from "./BrandLogo";

type RouteLoadingProps = {
  fullScreen?: boolean;
  message?: string;
};

export default function RouteLoading({
  fullScreen = false,
  message = "Loading..."
}: RouteLoadingProps) {
  return (
    <div
      className={`flex items-center justify-center ${
        fullScreen ? "theme-auth-bg min-h-screen" : "min-h-[60vh]"
      }`}
    >
      <div className="theme-surface flex flex-col items-center gap-4 rounded-3xl px-8 py-7">
        <div className="relative">
          <div className="absolute inset-0 rounded-[28px] bg-emerald-400/25 blur-2xl" />
          <BrandLogo size={88} className="relative rounded-[24px] shadow-[0_0_40px_rgba(16,185,129,0.24)]" priority />
        </div>

        <div className="text-center">
          <p className="text-sm font-medium tracking-[0.18em] text-emerald-700 uppercase">MedSyra</p>
          <p className="mt-1 text-sm theme-copy">{message}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.2s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-teal-500 [animation-delay:-0.1s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-600" />
        </div>
      </div>
    </div>
  );
}
