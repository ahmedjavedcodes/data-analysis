import Link from "next/link";

export default function RunNotFound() {
  return (
    <div className="max-w-xl space-y-2 py-10">
      <h1 className="text-lg font-semibold">Analysis not found</h1>
      <p className="text-sm text-muted">
        There is no saved analysis with this id, or it was saved in an older format. Analyse the product again from the
        start page.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
        Go to the start page
      </Link>
    </div>
  );
}
