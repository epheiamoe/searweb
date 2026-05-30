export interface RuleFile {
    name: string;
    description?: string;
    priority?: number;
    tags?: string[];
    match?: RuleMatch;
    sources?: SourceConfig[];
    process?: ProcessConfig[];
}
export interface RuleMatch {
    type?: 'domain' | 'path' | 'always';
    domains?: string[];
    paths?: string[];
    pathMatch?: 'exact' | 'prefix' | 'regex';
}
export interface SourceConfig {
    name: string;
    type: 'redirect' | 'original' | 'api';
    url?: string;
    validate?: SourceValidation;
}
export interface SourceValidation {
    status?: number[];
    minLength?: number;
    maxRetries?: number;
}
export interface ProcessConfig {
    when?: string;
    actions: ActionConfig[];
}
export type ActionConfig = RemoveUntilAction | RemoveFromAction | RemoveSectionAction | RemoveLinesAction | RemoveConsecutiveLinksAction | RedirectAction | ReplaceAction | MarkAction;
export interface BaseAction {
    action: string;
}
export interface RemoveUntilAction extends BaseAction {
    action: 'remove_until';
    pattern: string;
    keepMatch?: boolean;
}
export interface RemoveFromAction extends BaseAction {
    action: 'remove_from';
    pattern: string;
    inclusive?: boolean;
}
export interface RemoveSectionAction extends BaseAction {
    action: 'remove_section';
    from: 'start' | string;
    to: 'end' | string;
    fromInclusive?: boolean;
    toInclusive?: boolean;
}
export interface RemoveLinesAction extends BaseAction {
    action: 'remove_lines_matching';
    patterns: string[];
}
export interface RemoveConsecutiveLinksAction extends BaseAction {
    action: 'remove_consecutive_links';
    threshold: number;
    maxInlineChars?: number;
    replacement?: string;
}
export interface RedirectAction extends BaseAction {
    action: 'redirect';
    url: string;
}
export interface ReplaceAction extends BaseAction {
    action: 'replace';
    pattern: string;
    replacement: string;
}
export interface MarkAction extends BaseAction {
    action: 'mark';
    status: string;
    message?: string;
}
export interface RuleMatchResult {
    matched: boolean;
    params?: Record<string, string>;
}
export interface RuleExecutionContext {
    url: string;
    content: string;
    source: string;
    params?: Record<string, string>;
}
export interface RuleExecutionResult {
    content: string;
    source: string;
    modified: boolean;
    marks?: Array<{
        status: string;
        message?: string;
    }>;
}
//# sourceMappingURL=types.d.ts.map