// EnhancedAnalytics.jsx - With Beautiful Interactive Recharts (lint-clean)
import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

// Stable palette outside component so hooks don't depend on it
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f97316', '#14b8a6', '#f43f5e'];

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
  const [selectedEntities, setSelectedEntities] = useState([]); // <-- requested & now fully used
  const [filterMinRevenue, setFilterMinRevenue] = useState(0);
  const [filterMaxRevenue, setFilterMaxRevenue] = useState(Infinity);
  const [quickFilter, setQuickFilter] = useState('all');
  const [chartType, setChartType] = useState('bar'); // 'bar', 'line', 'pie', 'area'

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'charts', label: '📈 Visual Charts' },
    { id: 'rankings', label: '🏆 Rankings' },
    { id: 'insights', label: '💡 Insights' },
    { id: 'comparison', label: '⚖️ Compare' },
    { id: 'breakdown', label: '🔍 Breakdown' },
    { id: 'individual', label: '👤 Individual' },
    { id: 'geographic', label: '🗺️ Geographic' },
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
    // Apply entity selection if any
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

  // Total metrics
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

  // Pie chart data
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

  // Radar chart data (performance across metrics)
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

  // Custom tooltip
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

  // Custom pie label
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

  // Advanced Insights
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

  // --- Tab renders ---

  const renderSelectionPills = () => {
    const base = stats[selectedDimension] || [];
    // show top 30 by revenue for pill list (keeps UI snappy)
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
        {chartType === 'bar' && (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
              <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
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
              <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', r: 6 }}
                activeDot={{ r: 8 }}
                name="Revenue"
                animationDuration={1500}
              />
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
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry) => `${value} (${entry.payload.percentage}%)`}
              />
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
              <YAxis style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                name="Revenue"
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Dual Metric Chart */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
          Revenue vs Volume Analysis
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
            <YAxis yAxisId="left"  style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
            <YAxis yAxisId="right" orientation="right" style={{ fontSize: '12px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar yAxisId="left"  dataKey="revenue"   fill="#3b82f6" name="Revenue"   radius={[8, 8, 0, 0]} />
            <Bar yAxisId="right" dataKey="shipments" fill="#10b981" name="Shipments" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Performance Radar */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
          Performance Radar - Top 5 Entities
        </h3>
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
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>Revenue Overview</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData.slice(0, 5)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" style={{ fontSize: '11px' }} />
            <YAxis style={{ fontSize: '11px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
              {chartData.slice(0, 5).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
              {selectedMonth} {selectedYear} • {totalShipments} shipments • ${totalRevenue.toLocaleString()} revenue
            </p>
          </div>
          <button
            onClick={onBack}
            style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            ← Back to Dashboard
          </button>
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
        {selectedTab === 'overview'   && renderOverview()}
        {selectedTab === 'charts'     && renderChartsTab()}
        {selectedTab === 'insights'   && renderInsights()}
        {selectedTab === 'rankings'   && renderRankings()}
        {selectedTab === 'geographic' && renderGeographic()}
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
          {trendUp ? '↑' : '↓'} {trend}
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
