"use client";

import { useMemo } from "react";
import MainCard from "~/components/main-card";
import Loading from "~/components/loading";
import FlowDiagram from "~/components/flow-diagram";
import { Breadcrumbs } from "~/components/breadcrumbs";
import { useDiagram } from "~/hooks/useDiagram";
import { ApiKeyDialog } from "~/components/api-key-dialog";
import { ApiKeyButton } from "~/components/api-key-button";
import { useStarReminder } from "~/hooks/useStarReminder";
import type { GraphData } from "~/features/diagram/graph-types";

type RepoPageClientProps = {
  username: string;
  repo: string;
};

export default function RepoPageClient({ username, repo }: RepoPageClientProps) {

  useStarReminder();

  const normalizedUsername = username.toLowerCase();
  const normalizedRepo = repo.toLowerCase();

  const {
    diagram,
    error,
    loading,
    drillDownLoading,
    lastGenerated,
    cost,
    showApiKeyDialog,
    handleCopy,
    handleApiKeySubmit,
    handleCloseApiKeyDialog,
    handleOpenApiKeyDialog,
    handleExportImage,
    handleRegenerate,
    handleNodeClick,
    drillDown,
    state,
  } = useDiagram(normalizedUsername, normalizedRepo);

  // Parse the diagram JSON string into GraphData
  const graphData = useMemo<GraphData | null>(() => {
    if (!diagram) return null;
    try {
      return JSON.parse(diagram) as GraphData;
    } catch {
      return null;
    }
  }, [diagram]);

  return (
    <div className="flex flex-col items-center p-4">
      <div className="flex w-full justify-center pt-8">
        <MainCard
          isHome={false}
          username={normalizedUsername}
          repo={normalizedRepo}
          onCopy={handleCopy}
          lastGenerated={lastGenerated}
          onExportImage={handleExportImage}
          onRegenerate={handleRegenerate}
          loading={loading}
        />
      </div>
      {drillDown.isSubDiagram && (
        <div className="mt-4 w-full max-w-4xl px-4">
          <Breadcrumbs
            stack={drillDown.stack}
            onNavigate={drillDown.popToLevel}
            repoName={normalizedRepo}
          />
        </div>
      )}
      <div className="mt-8 flex w-full flex-col items-center gap-8">
        {drillDownLoading ? (
          <Loading
            cost=""
            status="started"
            message="Generating sub-diagram..."
          />
        ) : loading ? (
          <Loading
            cost={cost}
            status={state.status}
            message={state.message}
            explanation={state.explanation}
            mapping={state.mapping}
            diagram={state.diagram}
          />
        ) : error || state.error ? (
          <div className="mt-12 text-center">
            <p className="max-w-4xl text-lg font-medium text-red-700 dark:text-red-300">
              {error || state.error}
            </p>
            {state.parserError && (
              <pre className="mx-auto mt-4 max-w-4xl overflow-x-auto whitespace-pre-wrap rounded-md border border-neutral-300 bg-neutral-100 p-4 text-left text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                {state.parserError}
              </pre>
            )}
            {(error?.includes("API key") ||
              state.error?.includes("API key")) && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <ApiKeyButton onClick={handleOpenApiKeyDialog} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full justify-center px-4">
            <FlowDiagram
              data={graphData}
              onNodeClick={handleNodeClick}
            />
          </div>
        )}
      </div>

      <ApiKeyDialog
        isOpen={showApiKeyDialog}
        onClose={handleCloseApiKeyDialog}
        onSubmit={handleApiKeySubmit}
      />
    </div>
  );
}
