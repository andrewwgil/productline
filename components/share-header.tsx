import Link from "next/link";

const links = [
  { href: "/share", label: "Share" },
  { href: "/shared", label: "Gallery" },
];

export function ShareHeader({ current }: { current: "share" | "gallery" }) {
  return (
    <header className="mx-auto flex h-[4.75rem] w-full max-w-3xl items-center justify-between px-5">
      <Link href="/" className="font-serif text-[1.35rem] tracking-[-0.03em] text-ink">Product Line</Link>
      <nav className="flex items-center gap-5 text-[13px] font-semibold tracking-[-0.01em]">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={link.href === (current === "share" ? "/share" : "/shared") ? "page" : undefined}
            className={link.href === (current === "share" ? "/share" : "/shared") ? "text-ink" : "text-subtle hover:text-ink"}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
