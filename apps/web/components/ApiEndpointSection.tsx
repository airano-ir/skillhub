'use client';

import { useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';

export interface EndpointParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface EndpointDef {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
  rateLimit?: string;
  cacheTTL?: string;
  params?: EndpointParam[];
  bodyParams?: EndpointParam[];
  responseExample?: string;
  notes?: string;
}

interface ApiEndpointSectionProps {
  title: string;
  description: string;
  endpoints: EndpointDef[];
  labels: {
    parameters: string;
    requestBody: string;
    required: string;
    optional: string;
    default: string;
    responseExample: string;
    rateLimit: string;
    cache: string;
    authRequired: string;
    notes: string;
  };
}

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-success/20 text-success',
  POST: 'bg-primary-100 text-primary-600',
  DELETE: 'bg-red-100 text-red-600',
};

export function ApiEndpointSection({ title, description, endpoints, labels }: ApiEndpointSectionProps) {
  const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setExpandedIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="mb-10">
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      <p className="text-text-secondary mb-4">{description}</p>
      <div className="space-y-3" dir="ltr">
        {endpoints.map((ep, index) => {
          const expanded = expandedIndexes.has(index);
          const hasDetails = ep.params?.length || ep.bodyParams?.length || ep.responseExample || ep.notes;

          return (
            <div key={index} className="glass-card overflow-hidden text-left">
              <button
                type="button"
                onClick={() => hasDetails && toggle(index)}
                className={`w-full p-4 flex items-center gap-3 ${hasDetails ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default'}`}
              >
                <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${METHOD_STYLES[ep.method] || ''}`}>
                  {ep.method}
                </span>
                <code className="text-sm font-mono shrink-0">{ep.path}</code>
                {ep.auth && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 shrink-0">
                    <Lock className="w-3 h-3" />
                    {labels.authRequired}
                  </span>
                )}
                <span className="text-text-secondary text-sm ml-auto hidden sm:block truncate">{ep.description}</span>
                {hasDetails && (
                  <ChevronDown className={`w-4 h-4 text-text-secondary shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                )}
              </button>

              {/* Description visible on mobile (below sm) */}
              <div className="px-4 pb-2 sm:hidden">
                <p className="text-text-secondary text-sm">{ep.description}</p>
              </div>

              {expanded && hasDetails && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">
                  {/* Rate limit & cache badges */}
                  {(ep.rateLimit || ep.cacheTTL) && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {ep.rateLimit && (
                        <span className="text-text-secondary">
                          <span className="font-semibold">{labels.rateLimit}:</span> {ep.rateLimit}
                        </span>
                      )}
                      {ep.cacheTTL && (
                        <span className="text-text-secondary">
                          <span className="font-semibold">{labels.cache}:</span> {ep.cacheTTL}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Query parameters */}
                  {ep.params && ep.params.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{labels.parameters}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 text-left">
                              <th className="py-1.5 pr-3 font-medium text-text-secondary">Name</th>
                              <th className="py-1.5 pr-3 font-medium text-text-secondary">Type</th>
                              <th className="py-1.5 pr-3 font-medium text-text-secondary"></th>
                              <th className="py-1.5 font-medium text-text-secondary">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.params.map((p) => (
                              <tr key={p.name} className="border-b border-border/30">
                                <td className="py-1.5 pr-3 font-mono text-xs">{p.name}</td>
                                <td className="py-1.5 pr-3 text-text-secondary">{p.type}</td>
                                <td className="py-1.5 pr-3">
                                  <span className={`text-xs ${p.required ? 'text-red-500' : 'text-text-tertiary'}`}>
                                    {p.required ? labels.required : labels.optional}
                                  </span>
                                </td>
                                <td className="py-1.5 text-text-secondary">
                                  {p.description}
                                  {p.default && <span className="text-text-tertiary ml-1">(default: {p.default})</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Body parameters */}
                  {ep.bodyParams && ep.bodyParams.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{labels.requestBody}</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 text-left">
                              <th className="py-1.5 pr-3 font-medium text-text-secondary">Name</th>
                              <th className="py-1.5 pr-3 font-medium text-text-secondary">Type</th>
                              <th className="py-1.5 pr-3 font-medium text-text-secondary"></th>
                              <th className="py-1.5 font-medium text-text-secondary">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ep.bodyParams.map((p) => (
                              <tr key={p.name} className="border-b border-border/30">
                                <td className="py-1.5 pr-3 font-mono text-xs">{p.name}</td>
                                <td className="py-1.5 pr-3 text-text-secondary">{p.type}</td>
                                <td className="py-1.5 pr-3">
                                  <span className={`text-xs ${p.required ? 'text-red-500' : 'text-text-tertiary'}`}>
                                    {p.required ? labels.required : labels.optional}
                                  </span>
                                </td>
                                <td className="py-1.5 text-text-secondary">{p.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Response example */}
                  {ep.responseExample && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{labels.responseExample}</h4>
                      <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                        <pre className="text-sm font-mono text-gray-100 whitespace-pre">{ep.responseExample}</pre>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {ep.notes && (
                    <div className="text-sm text-text-secondary bg-primary-50/50 rounded-lg p-3">
                      <span className="font-semibold">{labels.notes}:</span> {ep.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
