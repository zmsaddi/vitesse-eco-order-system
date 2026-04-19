// Placeholder — Phase 1 يستبدلها بـ /login + redirect حسب الدور.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">Vitesse Eco</h1>
      <p className="mt-4 text-muted-foreground">
        Phase 0 — الأساس جاهز. Phase 1 تضيف المصادقة والتوجيه حسب الدور.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        <a href="/api/health" className="underline">
          /api/health
        </a>
      </p>
    </main>
  );
}
