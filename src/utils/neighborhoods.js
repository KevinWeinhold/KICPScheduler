const CANONICAL_NEIGHBORHOODS = {
	hanayama: 'Hanayama',
	tamondai: 'Tamondai',
	sannomiya: 'Sannomiya',
	hill: 'Hanayama',
	terrace: 'Tamondai',
	scranton: 'Sannomiya',
};

const toLower = (s) => (typeof s === 'string' ? s.toLowerCase().trim() : '');

export const normalizeNeighborhood = (name) => {
	const key = toLower(name);
	if (!key) return '';
	return CANONICAL_NEIGHBORHOODS[key] || String(name).trim();
};

export const normalizeNeighborhoodList = (val) => {
	if (!val) return [];
	if (Array.isArray(val)) return val.map(normalizeNeighborhood).filter(Boolean);
	return String(val)
		.replace(/\band\b/gi, ',')
		.replace(/[\/;&]/g, ',')
		.split(',')
		.map((s) => normalizeNeighborhood(s.trim()))
		.filter(Boolean);
};

export const neighborhoodKey = (name) => toLower(normalizeNeighborhood(name));

/** Hanayama and Tamondai should not be paired on the same event when avoidable. */
export const areNeighborhoodsIncompatible = (teacherNeighborhood, schoolNeighborhoods) => {
	const tn = neighborhoodKey(teacherNeighborhood);
	const neighborhoods = (Array.isArray(schoolNeighborhoods) ? schoolNeighborhoods : []).map(neighborhoodKey);
	return (
		(tn === 'hanayama' && neighborhoods.includes('tamondai')) ||
		(tn === 'tamondai' && neighborhoods.includes('hanayama'))
	);
};
