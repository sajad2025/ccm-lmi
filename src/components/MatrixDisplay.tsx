/** Renders a numeric matrix as a grid (values fixed to 1 decimal). */
const MatrixDisplay: React.FC<{
  matrix: number[][];
  title?: string;
}> = ({ matrix, title }) => {
  if (!matrix || matrix.length === 0) return null;

  return (
    <div className="matrix-display">
      {title && <div className="matrix-display-title">{title}</div>}
      <div className="matrix-container">
        <div>
          {matrix.map((row, i) => (
            <div key={i} className="matrix-row">
              {row.map((element, j) => (
                <div key={j} className="matrix-element">
                  {element.toFixed(1)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MatrixDisplay;
