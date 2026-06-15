function About() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">About</h1>
      <p className="text-gray-600 mb-4">
        This project is a monorepo with three services:
      </p>
      <ul className="list-disc list-inside space-y-2 text-gray-700">
        <li>
          <strong>frontend/</strong> &mdash; React (JSX) + Tailwind CSS + Vite
        </li>
        <li>
          <strong>backend/</strong> &mdash; Node.js + Express + Mongoose
          (MongoDB)
        </li>
        <li>
          <strong>ai-service/</strong> &mdash; Python FastAPI + pandas +
          scikit-learn + xgboost
        </li>
      </ul>
    </div>
  );
}

export default About;
