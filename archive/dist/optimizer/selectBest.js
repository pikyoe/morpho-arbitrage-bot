export function selectBest(list) {
    if (list.length === 0)
        return null;
    return list.reduce((best, current) => current.netProfit >
        best.netProfit
        ? current
        : best);
}
