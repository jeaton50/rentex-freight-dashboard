// EnhancedAnalytics.jsx - With Beautiful Interactive Recharts (with Monthly tab)
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart
} from 'recharts';
import { toPng, toSvg } from 'html-to-image';

// Stable palette outside component so hooks don't depend on it
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f97316', '#14b8a6', '#f43f5e'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function EnhancedAnalytics({
  shipments = [],
  selectedYear,
  selectedMonth,
  companies = [],
  agents = [],
  clients = [],
  cities = [],
  states = [],
  onBack,
  allMonthsData = {}
}) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedDimension, setSelectedDimension] = useState('company');
  const [selectedEntities, setSelectedEntities] = useState([]); // used
  const [filterMinRevenue, setFilterMinRevenue] = useState(0);
  const [filterMaxRevenue, setFilterMaxRevenue] = useState(Infinity);
  const [quickFilter, setQuickFilter] = useState('all');
  const [chartType, setChartType] = useState('bar'); // 'bar', 'line', 'pie', 'area'
  const [selectedIndividual, setSelectedIndividual] = useState('');
  const [individualDimension, setIndividualDimension] = useState('company');

  // Refs for chart export
  const overviewChartRef = useRef(null);
  const mainChartRef = useRef(null);
  const dualMetricChartRef = useRef(null);
  const radarChartRef = useRef(null);

  // Export Functions
  const exportChart = async (chartRef, filename, format = 'png') => {
    if (!chartRef.current) return;
    
    try {
      const dataUrl = format === 'svg' 
        ? await toSvg(chartRef.current, { backgroundColor: 'white' })
        : await toPng(chartRef.current, { backgroundColor: 'white', pixelRatio: 2 });
      
      const link = document.createElement('a');
      link.download = `${filename}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch (error) {
      console.error('Copy failed:', error);
      alert('Copy failed. Please try again.');
    }
  };

  const generateSummaryReport = () => {
    const report = `
FREIGHT ANALYTICS SUMMARY REPORT
Generated: ${new Date().toLocaleDateString()}
Period: ${selectedMonth} ${selectedYear}

KEY METRICS:
- Total Revenue: ${totalRevenue.toLocaleString()}
- Total Shipments: ${totalShipments}
- Average per Shipment: ${avgPerShipment.toFixed(2)}
- Active ${selectedDimension}s: ${currentData.length}

TOP PERFORMERS (by Revenue):
${rankedByRevenue.slice(0, 10).map((item, idx) => 
  `${idx + 1}. ${item.name}: ${item.revenue.toLocaleString()} (${item.count} shipments)`
).join('\n')}

INSIGHTS:
${insights.map(insight => `- ${insight.title}: ${insight.message}`).join('\n')}
    `.trim();
    
    return report;
  };

  const ExportButton = ({ onClick, children, variant = 'secondary' }) => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: variant === 'primary' ? '#3b82f6' : 'white',
        color: variant === 'primary' ? 'white' : '#475569',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      {children}
    </button>
  );

  // --- NEW: helpers for dates/months ---
 
  const parseShipDate = (s) => {
    const raw = s?.shipDate ?? s?.date ?? s?.createdAt ?? s?.updatedAt;
    const d = raw instanceof Date ? raw : new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };
  const toYM = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  // Build a set of years present in shipments (fallback to selectedYear or current)
  const yearsInData = useMemo(() => {
    const set = new Set();
    for (const s of shipments) {
      const d = parseShipDate(s);
      if (d) set.add(d.getFullYear());
    }
    return Array.from(set).sort((a,b)=>a-b);
  }, [shipments]);

  // If no year passed, pick the latest available or current year
  const defaultYear = useMemo(() => {
    if (selectedYear) return selectedYear;
    if (yearsInData.length) return yearsInData[yearsInData.length-1];
    return new Date().getFullYear();
  }, [selectedYear, yearsInData]);

  const [yearForMonthly, setYearForMonthly] = useState(defaultYear);

  // Tabs (added "monthly")
  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'charts', label: '📈 Visual Charts' },
    { id: 'rankings', label: '🏆 Rankings' },
    { id: 'insights', label: '💡 Insights' },
    { id: 'comparison', label: '⚖️ Compare' },
    { id: 'breakdown', label: '🔍 Breakdown' },
    { id: 'individual', label: '👤 Individual' },
    { id: 'geographic', label: '🗺️ Geographic' },
    { id: 'monthly', label: '🗓️ Monthly' }, // <--- NEW
  ];

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    const calculateStats = (groupField) => {
      const summary = {};
      shipments.forEach((s) => {
        const key = s[groupField] || '(Unassigned)';
        if (!summary[key]) {
          summary[key] = { name: key, count: 0, revenue: 0, shipments: [] };
        }
        summary[key].count += 1;
        summary[key].revenue += Number(s.shippingCharge || 0);
        summary[key].shipments.push(s);
      });

      return Object.values(summary)
        .map(item => ({
          ...item,
          avgPerShipment: item.count > 0 ? item.revenue / item.count : 0,
        }))
        .filter(item =>
          item.revenue >= filterMinRevenue && item.revenue <= filterMaxRevenue
        );
    };

    return {
      company: calculateStats('company'),
      agent: calculateStats('agent'),
      client: calculateStats('client'),
      city: calculateStats('city'),
      state: calculateStats('state'),
      location: calculateStats('location'),
      shipMethod: calculateStats('shipMethod'),
      vehicleType: calculateStats('vehicleType'),
    };
  }, [shipments, filterMinRevenue, filterMaxRevenue]);

  // Selection helpers
  const setSelection = useCallback((next) => setSelectedEntities(next), []);
  const toggleEntity = useCallback((name) => {
    setSelection((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }, [setSelection]);

  // Apply quick filters + entity selections
  const currentData = useMemo(() => {
    let data = stats[selectedDimension] || [];
    if (selectedEntities.length) {
      const s = new Set(selectedEntities);
      data = data.filter(d => s.has(d.name));
    }
    const sorted = [...data].sort((a, b) => b.revenue - a.revenue);

    if (quickFilter === 'top10') {
      return sorted.slice(0, Math.ceil(sorted.length * 0.1));
    } else if (quickFilter === 'top25') {
      return sorted.slice(0, Math.ceil(sorted.length * 0.25));
    } else if (quickFilter === 'bottom25') {
      return sorted.slice(-Math.ceil(sorted.length * 0.25));
    }
    return data;
  }, [stats, selectedDimension, quickFilter, selectedEntities]);

  // Sort and rank data
  const rankedByRevenue = useMemo(() => [...currentData].sort((a, b) => b.revenue - a.revenue), [currentData]);
  const rankedByVolume  = useMemo(() => [...currentData].sort((a, b) => b.count - a.count), [currentData]);
  const rankedByAvg     = useMemo(() => [...currentData].sort((a, b) => b.avgPerShipment - a.avgPerShipment), [currentData]);

  // Totals
  const totalRevenue   = useMemo(() => shipments.reduce((sum, s) => sum + Number(s.shippingCharge || 0), 0), [shipments]);
  const totalShipments = shipments.length;
  const avgPerShipment = totalShipments > 0 ? totalRevenue / totalShipments : 0;

  // Prepare chart data
  const chartData = useMemo(() => {
    return rankedByRevenue.slice(0, 10).map((item, idx) => ({
      name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
      fullName: item.name,
      revenue: Number(item.revenue.toFixed(2)),
      shipments: item.count,
      avgValue: Number(item.avgPerShipment.toFixed(2)),
      fill: COLORS[idx % COLORS.length],
    }));
  }, [rankedByRevenue]);

  // Pie data
  const pieChartData = useMemo(() => {
    const topEntities = rankedByRevenue.slice(0, 8);
    const otherRevenue = rankedByRevenue.slice(8).reduce((sum, e) => sum + e.revenue, 0);

    const data = topEntities.map(e => ({
      name: e.name,
      value: Number(e.revenue.toFixed(2)),
      percentage: totalRevenue > 0 ? ((e.revenue / totalRevenue) * 100).toFixed(1) : 0
    }));

    if (otherRevenue > 0) {
      data.push({
        name: 'Others',
        value: Number(otherRevenue.toFixed(2)),
        percentage: totalRevenue > 0 ? ((otherRevenue / totalRevenue) * 100).toFixed(1) : 0
      });
    }

    return data;
  }, [rankedByRevenue, totalRevenue]);

  // Radar (top 5 normalized)
  const radarData = useMemo(() => {
    if (rankedByRevenue.length === 0) return [];
    const top5 = rankedByRevenue.slice(0, 5);
    const maxRevenue = Math.max(...top5.map(e => e.revenue));
    const maxShipments = Math.max(...top5.map(e => e.count));
    const maxAvg = Math.max(...top5.map(e => e.avgPerShipment));

    return top5.map(entity => ({
      entity: entity.name.substring(0, 10),
      revenue: maxRevenue > 0 ? (entity.revenue / maxRevenue) * 100 : 0,
      volume:  maxShipments > 0 ? (entity.count   / maxShipments) * 100 : 0,
      avgValue:maxAvg > 0 ? (entity.avgPerShipment / maxAvg) * 100 : 0,
    }));
  }, [rankedByRevenue]);

  // Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'white',
          border: '2px solid #3b82f6',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
            {payload[0].payload.fullName || label}
          </p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color, fontSize: '13px', margin: '4px 0' }}>
              {entry.name === 'revenue'   && `Revenue: $${Number(entry.value).toLocaleString()}`}
              {entry.name === 'shipments' && `Shipments: ${entry.value}`}
              {entry.name === 'avgValue'  && `Avg Value: $${Number(entry.value).toFixed(2)}`}
              {entry.name === 'value'     && `Revenue: $${Number(entry.value).toLocaleString()}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Pie label
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '12px', fontWeight: 'bold' }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Insights
  const insights = useMemo(() => {
    const data = currentData;
    if (data.length === 0) return [];

    const out = [];
    const topEntity = rankedByRevenue[0];
    if (topEntity) {
      const marketShare = totalRevenue > 0 ? (topEntity.revenue / totalRevenue * 100).toFixed(1) : 0;
      out.push({
        type: 'success',
        icon: '🏆',
        title: 'Top Performer',
        message: `${topEntity.name} leads with $${topEntity.revenue.toLocaleString()} (${marketShare}% market share)`
      });
    }

    const top3Revenue = rankedByRevenue.slice(0, 3).reduce((sum, e) => sum + e.revenue, 0);
    const top3Share = totalRevenue > 0 ? (top3Revenue / totalRevenue * 100).toFixed(1) : 0;
    if (parseFloat(top3Share) > 60) {
      out.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Concentration Risk',
        message: `Top 3 ${selectedDimension}s account for ${top3Share}% of revenue - consider diversification`
      });
    }

    const highValue = data.filter(e => e.avgPerShipment > avgPerShipment * 1.5);
    if (highValue.length > 0) {
      out.push({
        type: 'info',
        icon: '💎',
        title: 'High-Value Opportunities',
        message: `${highValue.length} ${selectedDimension}(s) have 50%+ higher average shipment value`
      });
    }

    const lowPerf = data.filter(e => e.count < 3 && e.revenue < avgPerShipment * 3);
    if (lowPerf.length > 0) {
      out.push({
        type: 'warning',
        icon: '📉',
        title: 'Underperformers',
        message: `${lowPerf.length} ${selectedDimension}(s) with low activity - review or optimize`
      });
    }

    return out;
  }, [currentData, rankedByRevenue, totalRevenue, avgPerShipment, selectedDimension]);

  // Geographic stats (used in 'geographic' tab)
  const geographicStats = useMemo(() => {
    const stateData = stats.state || [];
    return stateData
      .map(state => ({
        ...state,
        intensity: (state.revenue / (totalRevenue || 1)) * 100
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [stats.state, totalRevenue]);

  // --- NEW: Monthly aggregation ---
  // seriesByYM: { 'YYYY-MM': { ym, year, month, revenue, count } }
  const monthlySeries = useMemo(() => {
    const bucket = new Map();
    for (const s of shipments) {
      const d = parseShipDate(s);
      if (!d) continue;
      const ym = toYM(d);
      const prev = bucket.get(ym) || { ym, year: d.getFullYear(), month: d.getMonth(), revenue: 0, count: 0 };
      prev.revenue += Number(s.shippingCharge || 0);
      prev.count += 1;
      bucket.set(ym, prev);
    }
    const arr = Array.from(bucket.values()).sort((a, b) => a.year - b.year || a.month - b.month);
    // decorate for charts
    return arr.map((r, idx) => ({
      ...r,
      name: `${MONTH_SHORT[r.month]} ${String(r.year).slice(-2)}`, // e.g., "Oct 25"
      fill: COLORS[idx % COLORS.length],
    }));
  }, [shipments]);

  // months for selected year
  const monthlyForYear = useMemo(() => {
    return monthlySeries.filter(r => r.year === Number(yearForMonthly));
  }, [monthlySeries, yearForMonthly]);

  // Cross-tabulation data for breakdown
  const crossTabData = useMemo(() => {
    const combinations = {};
    shipments.forEach(s => {
      const company = s.company || '(Unassigned)';
      const state = s.state || '(No State)';
      const agent = s.agent || '(No Agent)';
      const key = `${company}|${state}|${agent}`;
      
      if (!combinations[key]) {
        combinations[key] = { company, state, agent, revenue: 0, count: 0 };
      }
      combinations[key].revenue += Number(s.shippingCharge || 0);
      combinations[key].count += 1;
    });
    
    return Object.values(combinations).sort((a, b) => b.revenue - a.revenue);
  }, [shipments]);

  // Individual entity data
  const individualData = useMemo(() => {
    if (!selectedIndividual) return null;
    
    const entity = stats[individualDimension]?.find(item => item.name === selectedIndividual);
    if (!entity) return null;

    // Get monthly breakdown for this entity
    const monthlyBreakdown = {};
    entity.shipments.forEach(s => {
      const d = parseShipDate(s);
      if (!d) return;
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthlyBreakdown[monthKey]) {
        monthlyBreakdown[monthKey] = { 
          month: MONTH_SHORT[d.getMonth()], 
          year: d.getFullYear(),
          revenue: 0, 
          count: 0 
        };
      }
      monthlyBreakdown[monthKey].revenue += Number(s.shippingCharge || 0);
      monthlyBreakdown[monthKey].count += 1;
    });

    const monthlyData = Object.values(monthlyBreakdown).sort((a, b) => 
      a.year - b.year || MONTH_SHORT.indexOf(a.month) - MONTH_SHORT.indexOf(b.month)
    );

    return {
      ...entity,
      monthlyData,
      topClients: entity.shipments.reduce((acc, s) => {
        const client = s.client || '(No Client)';
        if (!acc[client]) acc[client] = { name: client, revenue: 0, count: 0 };
        acc[client].revenue += Number(s.shippingCharge || 0);
        acc[client].count += 1;
        return acc;
      }, {}),
      topStates: entity.shipments.reduce((acc, s) => {
        const state = s.state || '(No State)';
        if (!acc[state]) acc[state] = { name: state, revenue: 0, count: 0 };
        acc[state].revenue += Number(s.shippingCharge || 0);
        acc[state].count += 1;
        return acc;
      }, {})
    };
  }, [selectedIndividual, individualDimension, stats]);

  // --- UI sub-renders ---

  const renderSelectionPills = () => {
    const base = stats[selectedDimension] || [];
    const pillData = [...base].sort((a, b) => b.revenue - a.revenue).slice(0, 30);
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {pillData.map((d) => {
          const active = selectedEntities.includes(d.name);
          return (
            <button
              key={d.name}
              onClick={() => toggleEntity(d.name)}
              title={active ? 'Click to unselect' : 'Click to select'}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid #e2e8f0',
                background: active ? '#111827' : '#fff',
                color: active ? '#fff' : '#111827',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {d.name}
            </button>
          );
        })}
        {selectedEntities.length > 0 && (
          <button
            onClick={() => setSelection([])}
            style={{
              marginLeft: 8,
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>
    );
  };

  const renderChartsTab = () => (
    <div style={{ padding: '24px' }}>
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>
            Visual Analytics - {selectedDimension.charAt(0).toUpperCase() + selectedDimension.slice(1)}
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['bar', 'line', 'pie', 'area'].map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                style={{
                  padding: '8px 16px',
                  background: chartType === type ? '#3b82f6' : 'white',
                  color: chartType === type ? 'white' : '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {renderSelectionPills()}

        {/* Main Chart */}
        <div ref={mainChartRef}>
          {chartType === 'bar' && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="revenue" name="Revenue" radius={[8, 8, 0, 0]} animationDuration={1000}>
                  {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {chartType === 'line' && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 6 }} activeDot={{ r: 8 }} name="Revenue" animationDuration={1500} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {chartType === 'pie' && (
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={140}
                  fill="#8884d8"
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={800}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" height={36} formatter={(value, entry) => `${value} (${entry.payload.percentage}%)`} />
              </PieChart>
            </ResponsiveContainer>
          )}

          {chartType === 'area' && (
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Export buttons for main chart */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
          <ExportButton onClick={() => exportChart(mainChartRef, `${selectedDimension}-${chartType}-chart`, 'png')}>
            📸 Export as PNG
          </ExportButton>
          <ExportButton onClick={() => exportChart(mainChartRef, `${selectedDimension}-${chartType}-chart`, 'svg')}>
            🎨 Export as SVG
          </ExportButton>
        </div>
      </div>

      {/* Dual Metric Chart */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>
            Revenue vs Volume Analysis
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ExportButton onClick={() => exportChart(dualMetricChartRef, 'dual-metric-chart', 'png')}>
              🖼️ PNG
            </ExportButton>
            <ExportButton onClick={() => exportChart(dualMetricChartRef, 'dual-metric-chart', 'svg')}>
              🎨 SVG
            </ExportButton>
          </div>
        </div>
        <div ref={dualMetricChartRef}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
              <YAxis yAxisId="left"  style={{ fontSize: '12px' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" style={{ fontSize: '12px' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar yAxisId="left"  dataKey="revenue"   fill="#3b82f6" name="Revenue"   radius={[8, 8, 0, 0]} />
              <Bar yAxisId="right" dataKey="shipments" fill="#10b981" name="Shipments" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Radar */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>
            Performance Radar - Top 5 Entities
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ExportButton onClick={() => exportChart(radarChartRef, 'performance-radar', 'png')}>
              🖼️ PNG
            </ExportButton>
            <ExportButton onClick={() => exportChart(radarChartRef, 'performance-radar', 'svg')}>
              🎨 SVG
            </ExportButton>
          </div>
        </div>
        <div ref={radarChartRef}>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis dataKey="entity" style={{ fontSize: '12px' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} style={{ fontSize: '11px' }} />
              <Radar name="Revenue Score"  dataKey="revenue"  stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} animationDuration={1000} />
              <Radar name="Volume Score"   dataKey="volume"   stroke="#10b981" fill="#10b981" fillOpacity={0.3} animationDuration={1000} />
              <Radar name="Avg Value Score"dataKey="avgValue" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} animationDuration={1000} />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderOverview = () => (
    <div style={{ padding: '24px' }}>
      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <MetricCard title="Total Revenue"      value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} trend="+12.5%" trendUp />
        <MetricCard title="Total Shipments"    value={totalShipments} trend="+8.3%" trendUp />
        <MetricCard title="Avg per Shipment"   value={`$${avgPerShipment.toFixed(2)}`} trend="-2.1%" trendUp={false} />
        <MetricCard title="Active Entities"    value={currentData.length} subtitle={`of ${stats[selectedDimension]?.length || 0} total`} />
        <MetricCard title="Companies (ref)"    value={companies.length} />
        <MetricCard title="Agents (ref)"       value={agents.length} />
        <MetricCard title="Clients (ref)"      value={clients.length} />
        <MetricCard title="Cities (ref)"       value={cities.length} />
        <MetricCard title="States (ref)"       value={states.length} />
        <MetricCard title="Months in memory"   value={Object.keys(allMonthsData).length} />
      </div>

      {/* Quick Chart Preview */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>Revenue Overview</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ExportButton onClick={() => exportChart(overviewChartRef, 'overview-chart', 'png')}>
              🖼️ PNG
            </ExportButton>
            <ExportButton onClick={() => exportChart(overviewChartRef, 'overview-chart', 'svg')}>
              🎨 SVG
            </ExportButton>
          </div>
        </div>
        <div ref={overviewChartRef}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData.slice(0, 5)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" style={{ fontSize: '11px' }} />
              <YAxis style={{ fontSize: '11px' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                {chartData.slice(0, 5).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>Filters & Controls</h3>

        {renderSelectionPills()}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Quick Filter</label>
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="all">All Entities</option>
              <option value="top10">Top 10%</option>
              <option value="top25">Top 25%</option>
              <option value="bottom25">Bottom 25%</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Min Revenue</label>
            <input
              type="number"
              value={filterMinRevenue}
              onChange={(e) => setFilterMinRevenue(Number(e.target.value) || 0)}
              placeholder="$0"
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Max Revenue</label>
            <input
              type="number"
              value={filterMaxRevenue === Infinity ? '' : filterMaxRevenue}
              onChange={(e) => setFilterMaxRevenue(Number(e.target.value) || Infinity)}
              placeholder="No limit"
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => {
                setQuickFilter('all');
                setFilterMinRevenue(0);
                setFilterMaxRevenue(Infinity);
                setSelection([]);
              }}
              style={{ width: '100%', padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Dimension Selector */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>Analyze by Dimension</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {['company', 'agent', 'client', 'city', 'state', 'location', 'shipMethod', 'vehicleType'].map((dim) => (
            <button
              key={dim}
              onClick={() => { setSelectedDimension(dim); setSelection([]); }}
              style={{
                padding: '10px 20px',
                background: selectedDimension === dim ? '#3b82f6' : 'white',
                color: selectedDimension === dim ? 'white' : '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {dim.replace(/([A-Z])/g, ' $1').trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Top 10 */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Top Performers - {selectedDimension.charAt(0).toUpperCase() + selectedDimension.slice(1)}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rankedByRevenue.slice(0, 10).map((item, idx) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{
                width: '32px', height: '32px',
                background: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#f97316' : '#e2e8f0',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 'bold', fontSize: '14px',
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{item.count} shipments • ${item.avgPerShipment.toFixed(2)} avg</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1e293b' }}>
                  ${item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : 0}% share
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderInsights = () => (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
        AI-Powered Insights
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px' }}>
        {insights.map((insight, idx) => (
          <div
            key={idx}
            style={{
              background: 'white',
              border: `2px solid ${insight.type === 'success' ? '#10b981' : insight.type === 'warning' ? '#f59e0b' : '#3b82f6'}`,
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>{insight.icon}</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
                  {insight.title}
                </h4>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
                  {insight.message}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRankings = () => (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        <RankingCard title="💰 Top by Revenue" data={rankedByRevenue} valueKey="revenue" formatter={(val) => `$${val.toLocaleString()}`} />
        <RankingCard title="📦 Top by Volume"  data={rankedByVolume}  valueKey="count"    formatter={(val) => val.toString()} />
        <RankingCard title="📊 Top by Avg Value" data={rankedByAvg}   valueKey="avgPerShipment" formatter={(val) => `$${val.toFixed(2)}`} />
      </div>
    </div>
  );

  // NEW: Breakdown tab render
  const renderBreakdown = () => (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
        Cross-Dimensional Breakdown
      </h2>
      
      {/* Company x State breakdown chart */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Revenue by Company & State (Top 20 combinations)
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={crossTabData.slice(0, 20)} margin={{ top: 20, right: 30, left: 20, bottom: 100 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey={(entry) => `${entry.company} (${entry.state})`}
              angle={-45} 
              textAnchor="end" 
              height={120} 
              style={{ fontSize: '11px' }} 
            />
            <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div style={{
                      background: 'white',
                      border: '2px solid #3b82f6',
                      borderRadius: '8px',
                      padding: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }}>
                      <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
                        {data.company} • {data.state} • {data.agent}
                      </p>
                      <p style={{ color: '#3b82f6', fontSize: '13px', margin: '4px 0' }}>
                        Revenue: ${Number(data.revenue).toLocaleString()}
                      </p>
                      <p style={{ color: '#10b981', fontSize: '13px', margin: '4px 0' }}>
                        Shipments: {data.count}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cross-tab table */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Detailed Cross-Tabulation (Company × State × Agent)
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>Company</th>
                <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>State</th>
                <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>Agent</th>
                <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Revenue</th>
                <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Shipments</th>
                <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Avg Value</th>
              </tr>
            </thead>
            <tbody>
              {crossTabData.slice(0, 50).map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px', fontWeight: '600' }}>{item.company}</td>
                  <td style={{ padding: '10px' }}>{item.state}</td>
                  <td style={{ padding: '10px' }}>{item.agent}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    ${item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{item.count}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    ${(item.revenue / item.count).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matrix heatmap simulation */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Performance Matrix (Revenue Intensity)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {stats.company?.slice(0, 8).map((company, idx) => (
            <div key={company.name} style={{ 
              padding: '16px', 
              borderRadius: '8px',
              background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}20, ${COLORS[idx % COLORS.length]}40)`,
              border: `1px solid ${COLORS[idx % COLORS.length]}60`
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
                {company.name}
              </h4>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Revenue: ${company.revenue.toLocaleString()}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                Shipments: {company.count}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Avg: ${company.avgPerShipment.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // NEW: Individual tab render
  const renderIndividual = () => (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
        Individual Entity Analysis
      </h2>

      {/* Entity Selector */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Dimension
            </label>
            <select
              value={individualDimension}
              onChange={(e) => {
                setIndividualDimension(e.target.value);
                setSelectedIndividual('');
              }}
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            >
              {['company', 'agent', 'client', 'city', 'state'].map(dim => (
                <option key={dim} value={dim}>
                  {dim.charAt(0).toUpperCase() + dim.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Select Entity
            </label>
            <select
              value={selectedIndividual}
              onChange={(e) => setSelectedIndividual(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="">-- Select an entity --</option>
              {(stats[individualDimension] || [])
                .sort((a, b) => b.revenue - a.revenue)
                .map(item => (
                  <option key={item.name} value={item.name}>
                    {item.name} (${item.revenue.toLocaleString()})
                  </option>
                ))
              }
            </select>
          </div>
        </div>
      </div>

      {selectedIndividual && individualData && (
        <>
          {/* Overview Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <MetricCard 
              title="Total Revenue" 
              value={`$${individualData.revenue.toLocaleString()}`}
              subtitle={`${((individualData.revenue / totalRevenue) * 100).toFixed(1)}% of total`}
            />
            <MetricCard 
              title="Total Shipments" 
              value={individualData.count}
              subtitle={`${((individualData.count / totalShipments) * 100).toFixed(1)}% of total`}
            />
            <MetricCard 
              title="Avg per Shipment" 
              value={`$${individualData.avgPerShipment.toFixed(2)}`}
              subtitle={avgPerShipment > 0 ? `${((individualData.avgPerShipment / avgPerShipment) * 100).toFixed(0)}% of avg` : ''}
            />
            <MetricCard 
              title="Monthly Activity" 
              value={individualData.monthlyData.length}
              subtitle="active months"
            />
          </div>

          {/* Monthly Trend */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
              Monthly Performance - {selectedIndividual}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={individualData.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey={(entry) => `${entry.month} ${entry.year}`} style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} name="Shipments" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdowns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Top Clients */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
                Top Clients
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.values(individualData.topClients)
                  .sort((a, b) => b.revenue - a.revenue)
                  .slice(0, 8)
                  .map((client, idx) => (
                    <div key={client.name} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderRadius: '6px'
                    }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{client.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{client.count} shipments</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                          ${client.revenue.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Top States */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
                Top States
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.values(individualData.topStates)
                  .sort((a, b) => b.revenue - a.revenue)
                  .slice(0, 8)
                  .map((state, idx) => (
                    <div key={state.name} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderRadius: '6px'
                    }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{state.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{state.count} shipments</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                          ${state.revenue.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </>
      )}

      {!selectedIndividual && (
        <div style={{ 
          background: 'white', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          padding: '48px', 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
            Select an Entity to Analyze
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Choose a dimension and entity above to see detailed individual performance metrics, trends, and breakdowns.
          </p>
        </div>
      )}
    </div>
  );

  // NEW: Comparison tab render
  const renderComparison = () => (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
        Entity Comparison
      </h2>

      {/* Selection Pills */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Select Entities to Compare ({selectedEntities.length} selected)
        </h3>
        {renderSelectionPills()}
      </div>

      {selectedEntities.length >= 2 ? (
        <>
          {/* Comparison Chart */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
              Revenue & Volume Comparison
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={currentData.filter(item => selectedEntities.includes(item.name))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="count" fill="#10b981" name="Shipments" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison Table */}
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
              Detailed Comparison
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>Entity</th>
                    <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Revenue</th>
                    <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Shipments</th>
                    <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Avg Value</th>
                    <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Market Share</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData
                    .filter(item => selectedEntities.includes(item.name))
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((item, idx) => (
                      <tr key={item.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px', fontWeight: '600' }}>{item.name}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          ${item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{item.count}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          ${item.avgPerShipment.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div style={{ 
          background: 'white', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          padding: '48px', 
          textAlign: 'center' 
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚖️</div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}>
            Select 2+ Entities to Compare
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Click on the entity pills above to select multiple entities for side-by-side comparison.
          </p>
        </div>
      )}
    </div>
  );

  // --- NEW: Monthly tab render ---
  const renderMonthly = () => (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#1e293b' }}>Monthly Trend</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select
            value={yearForMonthly}
            onChange={(e) => setYearForMonthly(Number(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }}
          >
            {yearsInData.length ? yearsInData.map(y => <option key={y} value={y}>{y}</option>)
              : <option value={defaultYear}>{defaultYear}</option>}
          </select>
        </div>
      </div>

      {/* Revenue over months */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h4 style={{ marginTop: 0, color: '#1e293b' }}>Revenue by Month ({yearForMonthly})</h4>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={monthlyForYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" style={{ fontSize: 12 }} />
            <YAxis style={{ fontSize: 12 }} tickFormatter={(v)=>`$${(v/1000).toFixed(0)}k`} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Shipments over months */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
        <h4 style={{ marginTop: 0, color: '#1e293b' }}>Shipments by Month ({yearForMonthly})</h4>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={monthlyForYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" style={{ fontSize: 12 }} />
            <YAxis style={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" name="Shipments" fill="#10b981" radius={[8,8,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderGeographic = () => (
    <div style={{ padding: '24px' }}>
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>State Revenue Overview</h3>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={geographicStats.slice(0, 20)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
            <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
            <Tooltip />
            <Legend />
            <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>Top States (by revenue)</h3>
        <table style={{ width: '100%', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#64748b' }}>Rank</th>
              <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#64748b' }}>State</th>
              <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#64748b' }}>Revenue</th>
              <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#64748b' }}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {geographicStats.slice(0, 20).map((row, idx) => (
              <tr key={row.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px' }}>{idx + 1}</td>
                <td style={{ padding: '8px', fontWeight: '600' }}>{row.name}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>${row.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{(row.intensity).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
              📊 Enhanced Analytics with Interactive Charts
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              {selectedMonth ? `${MONTH_SHORT[Number(selectedMonth)-1]} ` : ''}{selectedYear || ''}{selectedMonth || selectedYear ? ' • ' : ''}{totalShipments} shipments • ${totalRevenue.toLocaleString()} revenue
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Export Controls */}
            <ExportButton 
              onClick={() => copyToClipboard(generateSummaryReport())}
              variant="secondary"
            >
              📋 Copy Summary
            </ExportButton>
            <ExportButton 
              onClick={() => exportToCSV(rankedByRevenue.map(item => ({
                name: item.name,
                revenue: item.revenue,
                shipments: item.count,
                avgPerShipment: item.avgPerShipment,
                marketShare: ((item.revenue / totalRevenue) * 100).toFixed(1) + '%'
              })), `analytics-data-${selectedMonth}-${selectedYear}`)}
              variant="secondary"
            >
              📊 Export Data
            </ExportButton>
            <button
              onClick={onBack}
              style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              style={{
                padding: '16px 24px',
                background: 'transparent',
                color: selectedTab === tab.id ? '#3b82f6' : '#64748b',
                border: 'none',
                borderBottom: selectedTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {selectedTab === 'overview'    && renderOverview()}
        {selectedTab === 'charts'      && renderChartsTab()}
        {selectedTab === 'insights'    && renderInsights()}
        {selectedTab === 'rankings'    && renderRankings()}
        {selectedTab === 'comparison'  && renderComparison()}
        {selectedTab === 'breakdown'   && renderBreakdown()}
        {selectedTab === 'individual'  && renderIndividual()}
        {selectedTab === 'geographic'  && renderGeographic()}
        {selectedTab === 'monthly'     && renderMonthly()}
      </div>
    </div>
  );
}

// Helper Components
function MetricCard({ title, value, trend, trendUp, subtitle }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>{value}</div>
      {trend && (
        <div style={{ fontSize: '12px', color: trendUp ? '#10b981' : '#ef4444', fontWeight: '600' }}>
          {trendUp ? '↗' : '↘'} {trend}
        </div>
      )}
      {subtitle && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{subtitle}</div>}
    </div>
  );
}

function RankingCard({ title, data, valueKey, formatter }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>{title}</h3>
      <table style={{ width: '100%', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#64748b' }}>Rank</th>
            <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#64748b' }}>Entity</th>
            <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#64748b' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((item, idx) => (
            <tr key={item.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px' }}>{idx + 1}</td>
              <td style={{ padding: '8px', fontWeight: '600' }}>{item.name}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{formatter(item[valueKey])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EnhancedAnalytics;
