import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 py-4 lg:px-8">
      <div className="container mx-auto flex h-8 max-w-4xl items-center justify-center">
        <span className="text-sm text-gray-500">
          Inspired by{" "}
          <Link
            href="https://gitdiagram.com"
            className="text-gray-600 transition-colors hover:text-gray-900 hover:underline"
          >
            Ahmed Khaleel of gitdiagram.com
          </Link>
        </span>
      </div>
    </footer>
  );
}
