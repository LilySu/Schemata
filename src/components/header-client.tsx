"use client";

import Link from "next/link";
import { FaGithub } from "react-icons/fa";

interface HeaderClientProps {
  starCount: number | null;
}

export function HeaderClient({ starCount }: HeaderClientProps) {
  return (
    <header className="px-4 pt-4 sm:px-8 sm:pt-6">
      <div className="mx-auto flex h-12 max-w-3xl items-center justify-between rounded-full border border-gray-200 bg-white/80 px-6 backdrop-blur-md">
        <Link href="/" className="flex items-center">
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            Schemata
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="https://github.com/LilySu/Schemata"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <FaGithub className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
