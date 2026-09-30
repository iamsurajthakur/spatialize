import Image from "next/image";
import Link from "next/link";
import { GITHUB_URL, PORTFOLIO_URL } from "./Navbar";

const linkGroups = [
  {
    title: "Project",
    links: [
      { label: "Source code", href: GITHUB_URL },
      { label: "Documentation", href: `${GITHUB_URL}#readme` },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "Portfolio", href: PORTFOLIO_URL },
      { label: "Share feedback", href: `${GITHUB_URL}/issues` },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="home-footer">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="home-footer-main">
          <div className="home-footer-about">
            <Link href="/" className="home-brand home-footer-brand">
              <Image src="/icon.svg" alt="" width={32} height={32} unoptimized />
              Spatialize
            </Link>
            <p>A new perspective on your space.</p>
            <p className="home-footer-description">
              Turn a room image into a little world you can explore.
            </p>
          </div>
          {linkGroups.map((group) => (
            <nav key={group.title} aria-label={`Footer ${group.title.toLowerCase()}`}>
              <h2 className="home-footer-heading">{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      className="home-footer-link"
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                      <span aria-hidden="true">↗</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="home-footer-bottom">
          <p>
            Built by{" "}
            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
              Suraj Thakur<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <a className="home-footer-return" href="#room-upload">
            Back to upload <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
