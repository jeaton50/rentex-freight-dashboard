import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Freight Dashboard header', () => {
  render(<App />);
  const linkElement = screen.getByText(/Freight Dashboard/i);
  expect(linkElement).toBeInTheDocument();
});
