"use client";

import React, { useEffect } from "react";
import { CustomCssConfig, CustomJsConfig } from "@/lib/captive-portal-plugins/types";

export function CustomCodeInjector({
  cssConfig,
  jsConfig,
}: {
  cssConfig: CustomCssConfig;
  jsConfig: CustomJsConfig;
}) {
  useEffect(() => {
    if (!jsConfig.enabled || !jsConfig.executeOnLoad || !jsConfig.jsContent) return;
    try {
      // NOT a sandbox. `new Function` compiles this string in the page's own realm with full
      // access to the DOM, cookies, and every API this origin has — it is exactly as privileged
      // as a <script> tag. That is acceptable only because jsContent is authored by the tenant's
      // own staff for the tenant's own captive portal (the same trust level as pasting a script
      // into their site), and must never be fed a value that reaches this component from an
      // unauthenticated request. The previous "safe sandboxed" comment invited exactly that.
      const scriptFn = new Function(jsConfig.jsContent);
      scriptFn();
    } catch (err) {
      console.warn("Captive portal custom script execution error:", err);
    }
  }, [jsConfig.enabled, jsConfig.executeOnLoad, jsConfig.jsContent]);

  return (
    <>
      {cssConfig.enabled && cssConfig.cssContent && (
        <style dangerouslySetInnerHTML={{ __html: cssConfig.cssContent }} />
      )}
    </>
  );
}
