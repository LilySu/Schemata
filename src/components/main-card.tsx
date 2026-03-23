"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import React from "react";
import { exampleRepos, isExampleRepo } from "~/lib/exampleRepos";
import { ExportDropdown } from "./export-dropdown";
import { ChevronUp, ChevronDown } from "lucide-react";

import { parseGitHubRepoUrl } from "~/features/diagram/github-url";

interface MainCardProps {
  isHome?: boolean;
  username?: string;
  repo?: string;
  onCopy?: () => void;
  lastGenerated?: Date;
  onExportImage?: () => void;
  onRegenerate?: () => void;
  loading?: boolean;
}

export default function MainCard({
  isHome = true,
  username,
  repo,
  onCopy,
  lastGenerated,
  onExportImage,
  onRegenerate,
  loading,
}: MainCardProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState("");
  const [activeDropdown, setActiveDropdown] = useState<"export" | null>(null);
  const router = useRouter();
  const isExampleRepoSelected =
    !isHome && !!username && !!repo && isExampleRepo(username, repo);

  useEffect(() => {
    if (username && repo) {
      setRepoUrl(`https://github.com/${username}/${repo}`);
    }
  }, [username, repo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsed = parseGitHubRepoUrl(repoUrl);
    if (!parsed) {
      setError("Please enter a valid GitHub repository URL");
      return;
    }

    const { username, repo } = parsed;
    const sanitizedUsername = encodeURIComponent(username);
    const sanitizedRepo = encodeURIComponent(repo);
    router.push(`/${sanitizedUsername}/${sanitizedRepo}`);
  };

  const handleExampleClick = (repoPath: string, e: React.MouseEvent) => {
    e.preventDefault();
    router.push(repoPath);
  };

  const handleDropdownToggle = (dropdown: "export") => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  return (
    <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-3">
          <Input
            placeholder="https://github.com/username/repo"
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-gray-400 focus:ring-0 sm:py-4 sm:text-lg"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
          />
          <Button
            type="submit"
            className="rounded-xl bg-gray-900 px-6 py-3 text-base font-medium text-white shadow-none hover:bg-gray-800 sm:py-4 sm:text-lg"
          >
            Diagram
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Dropdowns Container */}
        {!isHome && (
          <div className="space-y-4">
            {!loading && (
              <>
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-3">
                  {onRegenerate && (
                    <button
                      type="button"
                      disabled={isExampleRepoSelected}
                      title={
                        isExampleRepoSelected
                          ? "Regeneration is disabled for example repositories."
                          : undefined
                      }
                      className={`flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium transition-colors ${
                        isExampleRepoSelected
                          ? "cursor-not-allowed bg-gray-50 text-gray-400"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveDropdown(null);
                        if (isExampleRepoSelected) return;
                        onRegenerate();
                      }}
                    >
                      Regenerate Diagram
                    </button>
                  )}
                  {onCopy && lastGenerated && onExportImage && (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDropdownToggle("export");
                        }}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium transition-colors ${
                          activeDropdown === "export"
                            ? "bg-gray-100 text-gray-900"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span>Export Diagram</span>
                        {activeDropdown === "export" ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className={`transition-all duration-200 ${
                    activeDropdown
                      ? "pointer-events-auto max-h-[500px] opacity-100"
                      : "pointer-events-none max-h-0 opacity-0"
                  }`}
                >
                  {activeDropdown === "export" && (
                    <ExportDropdown
                      onCopy={onCopy!}
                      lastGenerated={lastGenerated!}
                      onExportImage={onExportImage!}
                      isOpen={true}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Example Repositories */}
        {isHome && (
          <div className="space-y-3">
            <div className="text-sm text-gray-500">
              Try these example repositories:
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(exampleRepos).map(([name, path]) => (
                <Button
                  key={name}
                  variant="outline"
                  className="rounded-full border border-gray-200 bg-gray-50 text-sm text-gray-600 shadow-none transition-colors hover:bg-gray-100 hover:text-gray-900"
                  onClick={(e) => handleExampleClick(path, e)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
