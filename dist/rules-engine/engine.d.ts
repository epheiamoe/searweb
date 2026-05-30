import { RuleFile, RuleExecutionContext, RuleExecutionResult, SourceConfig } from './types.js';
export declare class RuleEngine {
    private rules;
    private rulesDir;
    constructor(rulesDir?: string);
    loadRules(): void;
    findMatchingRules(url: string): Array<{
        rule: RuleFile;
        params: Record<string, string>;
    }>;
    private matchRule;
    private matchPath;
    private matchParameterizedPath;
    getSourcesForUrl(url: string): SourceConfig[];
    executeRules(context: RuleExecutionContext): RuleExecutionResult;
    executeTaggedRules(context: RuleExecutionContext, tags: string[]): RuleExecutionResult;
    private evaluateCondition;
    private executeAction;
    private actionRemoveUntil;
    private actionRemoveFrom;
    private actionRemoveSection;
    private actionRemoveLines;
    private actionRemoveConsecutiveLinks;
    private isLinkLine;
    private actionReplace;
    private interpolate;
}
//# sourceMappingURL=engine.d.ts.map