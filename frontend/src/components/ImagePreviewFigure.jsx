export default function ImagePreviewFigure({ src, previewSrc, alt, caption, loading = "lazy" }) {
  const displaySrc = previewSrc || src;

  return (
    <figure className="gallery-figure">
      <div className="gallery-figure__frame">
        <img src={displaySrc} alt={alt} loading={loading} decoding="async" />
        <a
          className="gallery-figure__zoom"
          href={src}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir ${caption} em tamanho maior`}
          title={`Abrir ${caption} em tamanho maior`}
        >
          +
        </a>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
