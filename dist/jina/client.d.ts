interface JinaResponse {
    title?: string;
    url?: string;
    content?: string;
}
export declare class JinaClient {
    private keys;
    private currentKeyIndex;
    private disableRemote;
    private localFallback;
    private baseUrl;
    constructor();
    fetch(url: string): Promise<JinaResponse>;
    private fetchRemote;
    private fetchLocal;
    private simpleHtmlToText;
    private getCurrentKey;
    private rotateKey;
    private isRateLimitError;
}
export {};
//# sourceMappingURL=client.d.ts.map