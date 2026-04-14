import { useEffect } from "react";

/**
 * Toast 通知组件
 * @param {{ message: string, isError: boolean, onDone: Function }} props
 */
export const Toast = Object.freeze(function Toast({ message, isError, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={`an-toast ${isError ? "an-toast--error" : ""}`}>
      {message}
    </div>
  );
});
