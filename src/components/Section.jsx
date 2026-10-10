export default function Section({ title, defaultOpen, children }) {
  return (
    <details open={defaultOpen}>
      <summary>{title}</summary>
      <div className="body">{children}</div>
    </details>
  );
}