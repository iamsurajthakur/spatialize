import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

// Replace this URL to point the navbar at a different repository.
export const GITHUB_URL = "https://github.com/iamsurajthakur/spatialize";
export const PORTFOLIO_URL = "https://surajthakur.info.np";

export default function Navbar() {
  return (
    <header className="home-header">
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
        aria-label="Main navigation"
      >
        <Link href="/" className="home-brand">
          <Image src="/icon.svg" alt="" width={32} height={32} className="shrink-0" unoptimized />
          Spatialize
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="home-nav-control"
            aria-label="GitHub (opens in a new tab)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7M15 22v-3.4c0-1 .1-1.4-.5-2 3.3-.4 6.7-1.6 6.7-7.3 0-1.6-.6-2.8-1.5-3.8.2-.4.7-1.9-.2-3.8 0 0-1.3-.4-4.1 1.5a14 14 0 0 0-7.4 0C5.2 1.3 3.9 1.7 3.9 1.7 3 3.6 3.5 5.1 3.7 5.5c-.9 1-1.5 2.2-1.5 3.8 0 5.7 3.4 6.9 6.7 7.3-.6.6-.6 1.2-.5 2V22" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="home-nav-control"
            aria-label="Portfolio (opens in a new tab)"
          >
            Portfolio
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              aria-hidden="true"
            >
              <path d="M4 12 12 4M4 4h8v8" />
            </svg>
          </a>
          <span className="home-nav-divider" aria-hidden="true" />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
