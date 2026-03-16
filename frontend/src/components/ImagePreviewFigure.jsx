export default function ImagePreviewFigure({ src, alt, caption }) {
  return (
    <figure className="gallery-figure">
      <div className="gallery-figure__frame">
        <img src={src} alt={alt} />
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
