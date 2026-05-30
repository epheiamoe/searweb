// src/rules-engine/engine.ts - Rule engine implementation
import { load as loadYaml } from 'js-yaml';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
export class RuleEngine {
    rules = [];
    rulesDir;
    constructor(rulesDir = './rules') {
        this.rulesDir = rulesDir;
        this.loadRules();
    }
    loadRules() {
        this.rules = [];
        try {
            const files = readdirSync(this.rulesDir).filter(f => extname(f) === '.yaml' || extname(f) === '.yml');
            for (const file of files) {
                try {
                    const content = readFileSync(join(this.rulesDir, file), 'utf-8');
                    const rule = loadYaml(content);
                    if (rule && rule.name) {
                        this.rules.push({
                            ...rule,
                            priority: rule.priority ?? 50,
                        });
                    }
                }
                catch (e) {
                    console.error(`Failed to load rule file ${file}:`, e);
                }
            }
            // Sort by priority (highest first)
            this.rules.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
        }
        catch (e) {
            console.warn(`Failed to load rules from ${this.rulesDir}:`, e);
        }
    }
    findMatchingRules(url) {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname;
        const matched = [];
        for (const rule of this.rules) {
            const result = this.matchRule(rule.match, hostname, pathname);
            if (result.matched && result.params) {
                matched.push({ rule, params: result.params });
            }
        }
        return matched;
    }
    matchRule(match, hostname, pathname) {
        if (!match)
            return { matched: false };
        if (match.type === 'always') {
            return { matched: true, params: {} };
        }
        // Check domains
        if (match.domains) {
            let domainMatched = false;
            for (const domain of match.domains) {
                if (domain.startsWith('*.')) {
                    const suffix = domain.slice(2);
                    if (hostname.endsWith(suffix)) {
                        domainMatched = true;
                        break;
                    }
                }
                else if (hostname === domain || hostname.endsWith('.' + domain)) {
                    domainMatched = true;
                    break;
                }
            }
            if (!domainMatched)
                return { matched: false };
        }
        // Check paths
        let params = {};
        if (match.paths) {
            let pathMatched = false;
            for (const pathPattern of match.paths) {
                const result = this.matchPath(pathPattern, pathname, match.pathMatch || 'prefix');
                if (result.matched) {
                    pathMatched = true;
                    params = { ...params, ...result.params };
                    break;
                }
            }
            if (!pathMatched)
                return { matched: false };
        }
        return { matched: true, params };
    }
    matchPath(pattern, pathname, matchType) {
        if (matchType === 'exact') {
            return { matched: pathname === pattern, params: {} };
        }
        if (matchType === 'prefix') {
            return { matched: pathname.startsWith(pattern), params: {} };
        }
        if (matchType === 'regex') {
            const regex = new RegExp(pattern);
            const match = regex.exec(pathname);
            if (match) {
                const params = {};
                for (let i = 1; i < match.length; i++) {
                    params[String(i)] = match[i];
                }
                return { matched: true, params };
            }
            return { matched: false };
        }
        // Default: pattern with named parameters like /{owner}/{repo}/blob/{branch}/{*path}
        return this.matchParameterizedPath(pattern, pathname);
    }
    matchParameterizedPath(pattern, pathname) {
        const patternParts = pattern.split('/').filter(Boolean);
        const pathParts = pathname.split('/').filter(Boolean);
        if (patternParts.length > pathParts.length) {
            return { matched: false };
        }
        const params = {};
        for (let i = 0; i < patternParts.length; i++) {
            const pp = patternParts[i];
            const pt = pathParts[i];
            if (pp.startsWith('{*')) {
                // Greedy match: consume all remaining path parts
                const paramName = pp.slice(2, -1);
                params[paramName] = pathParts.slice(i).join('/');
                return { matched: true, params };
            }
            else if (pp.startsWith('{') && pp.endsWith('}')) {
                const paramName = pp.slice(1, -1);
                params[paramName] = pt;
            }
            else if (pp !== pt) {
                return { matched: false };
            }
        }
        // If pattern has exact count of parts, path must also have exact count
        if (patternParts.length === pathParts.length) {
            return { matched: true, params };
        }
        return { matched: false };
    }
    getSourcesForUrl(url) {
        const matched = this.findMatchingRules(url);
        for (const { rule } of matched) {
            if (rule.sources && rule.sources.length > 0) {
                return rule.sources;
            }
        }
        return [{ name: 'original', type: 'original' }];
    }
    executeRules(context) {
        const matched = this.findMatchingRules(context.url);
        let content = context.content;
        let modified = false;
        const marks = [];
        for (const { rule, params } of matched) {
            if (!rule.process)
                continue;
            for (const processConfig of rule.process) {
                // Check condition
                if (processConfig.when) {
                    if (!this.evaluateCondition(processConfig.when, context.source)) {
                        continue;
                    }
                }
                for (const action of processConfig.actions) {
                    const result = this.executeAction(action, content, { ...context.params, ...params });
                    if (result.content !== content) {
                        modified = true;
                    }
                    content = result.content;
                    if (result.mark) {
                        marks.push(result.mark);
                    }
                }
            }
        }
        return { content, source: context.source, modified, marks };
    }
    executeTaggedRules(context, tags) {
        let content = context.content;
        let modified = false;
        const marks = [];
        for (const rule of this.rules) {
            if (!rule.tags || !tags.some(t => rule.tags.includes(t))) {
                continue;
            }
            if (!rule.process)
                continue;
            for (const processConfig of rule.process) {
                for (const action of processConfig.actions) {
                    const result = this.executeAction(action, content, context.params || {});
                    if (result.content !== content) {
                        modified = true;
                    }
                    content = result.content;
                    if (result.mark) {
                        marks.push(result.mark);
                    }
                }
            }
        }
        return { content, source: context.source, modified, marks };
    }
    evaluateCondition(condition, source) {
        // Simple condition evaluation: "source == 'name'"
        const match = condition.match(/^source\s*==\s*['"](.+?)['"]$/);
        if (match) {
            return source === match[1];
        }
        return false;
    }
    executeAction(action, content, params) {
        switch (action.action) {
            case 'remove_until':
                return { content: this.actionRemoveUntil(content, action, params) };
            case 'remove_from':
                return { content: this.actionRemoveFrom(content, action, params) };
            case 'remove_section':
                return { content: this.actionRemoveSection(content, action, params) };
            case 'remove_lines_matching':
                return { content: this.actionRemoveLines(content, action, params) };
            case 'remove_consecutive_links':
                return { content: this.actionRemoveConsecutiveLinks(content, action) };
            case 'redirect':
                return { content }; // Redirect is handled at fetch level, not content level
            case 'replace':
                return { content: this.actionReplace(content, action, params) };
            case 'mark':
                return {
                    content,
                    mark: {
                        status: action.status,
                        message: action.message,
                    },
                };
            default:
                return { content };
        }
    }
    actionRemoveUntil(content, action, params) {
        const pattern = this.interpolate(action.pattern, params);
        const regex = new RegExp(pattern, 'm');
        const match = regex.exec(content);
        if (!match)
            return content;
        const endPos = match.index + (action.keepMatch ? 0 : match[0].length);
        return content.slice(endPos).trimStart();
    }
    actionRemoveFrom(content, action, params) {
        const pattern = this.interpolate(action.pattern, params);
        const regex = new RegExp(pattern, 'm');
        const match = regex.exec(content);
        if (!match)
            return content;
        const startPos = action.inclusive ? match.index + match[0].length : match.index;
        return content.slice(0, startPos).trimEnd();
    }
    actionRemoveSection(content, action, params) {
        const fromPattern = action.from === 'start' ? '^' : this.interpolate(action.from, params);
        const toPattern = action.to === 'end' ? '$' : this.interpolate(action.to, params);
        let startPos = 0;
        if (action.from !== 'start') {
            const fromRegex = new RegExp(fromPattern, 'm');
            const fromMatch = fromRegex.exec(content);
            if (!fromMatch)
                return content;
            startPos = action.fromInclusive !== false ? fromMatch.index : fromMatch.index + fromMatch[0].length;
        }
        let endPos = content.length;
        if (action.to !== 'end') {
            const toRegex = new RegExp(toPattern, 'm');
            const toMatch = toRegex.exec(content.slice(startPos));
            if (toMatch) {
                endPos = startPos + (action.toInclusive !== false ? toMatch.index + toMatch[0].length : toMatch.index);
            }
        }
        return content.slice(0, startPos) + content.slice(endPos);
    }
    actionRemoveLines(content, action, params) {
        const lines = content.split('\n');
        const filtered = lines.filter(line => {
            return !action.patterns.some(pattern => {
                const interpolated = this.interpolate(pattern, params);
                const regex = new RegExp(interpolated);
                return regex.test(line);
            });
        });
        return filtered.join('\n');
    }
    actionRemoveConsecutiveLinks(content, action) {
        const maxInlineChars = action.maxInlineChars ?? 10;
        const threshold = action.threshold;
        const replacement = action.replacement ?? `[Removed {count} consecutive links]`;
        const lines = content.split('\n');
        const result = [];
        let consecutiveLinks = 0;
        let linkStartIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isLink = this.isLinkLine(line, maxInlineChars);
            if (isLink) {
                if (consecutiveLinks === 0) {
                    linkStartIndex = i;
                }
                consecutiveLinks++;
            }
            else {
                if (consecutiveLinks >= threshold) {
                    result.push(replacement.replace('{count}', String(consecutiveLinks)));
                }
                else if (consecutiveLinks > 0) {
                    for (let j = linkStartIndex; j < i; j++) {
                        result.push(lines[j]);
                    }
                }
                consecutiveLinks = 0;
                linkStartIndex = -1;
                result.push(line);
            }
        }
        // Handle trailing links
        if (consecutiveLinks >= threshold) {
            result.push(replacement.replace('{count}', String(consecutiveLinks)));
        }
        else if (consecutiveLinks > 0) {
            for (let j = linkStartIndex; j < lines.length; j++) {
                result.push(lines[j]);
            }
        }
        return result.join('\n');
    }
    isLinkLine(line, maxInlineChars) {
        // Match markdown links [text](url) or bare URLs
        const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
        const bareUrlRegex = /https?:\/\/\S+/g;
        let linkChars = 0;
        let match;
        while ((match = linkRegex.exec(line)) !== null) {
            linkChars += match[0].length;
        }
        while ((match = bareUrlRegex.exec(line)) !== null) {
            linkChars += match[0].length;
        }
        const nonLinkChars = line.length - linkChars;
        return nonLinkChars <= maxInlineChars && linkChars > 0;
    }
    actionReplace(content, action, params) {
        const pattern = this.interpolate(action.pattern, params);
        const replacement = this.interpolate(action.replacement, params);
        const regex = new RegExp(pattern, 'g');
        return content.replace(regex, replacement);
    }
    interpolate(template, params) {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }
}
//# sourceMappingURL=engine.js.map