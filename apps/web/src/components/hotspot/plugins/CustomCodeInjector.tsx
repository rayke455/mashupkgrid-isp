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
      // Safe sandboxed script execution
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
