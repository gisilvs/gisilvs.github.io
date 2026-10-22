const parameterSelect = document.getElementById('scatter-parameter');
const scatterPlot = document.getElementById('pretraining-scatter-plot');

parameterSelect.addEventListener('change', () => {
  const label = parameterSelect.selectedOptions[0].textContent;
  scatterPlot.src = `../../assets/pretraining-scatter-${parameterSelect.value}.svg`;
  scatterPlot.alt = `${label}: target versus predicted normalized values for all 10,000 test examples. The dashed diagonal marks exact recovery.`;
});
