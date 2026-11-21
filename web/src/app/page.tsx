// Placeholder until M4, when `/` redirects to the user's last group.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Owezy</h1>
      <p className="text-muted-foreground">Split expenses with friends in a few taps.</p>
      <p className="text-sm">
        <span className="text-positive">You get back ₹675.00</span>
        {" · "}
        <span className="text-negative">You owe ₹150.00</span>
      </p>
    </main>
  );
}
