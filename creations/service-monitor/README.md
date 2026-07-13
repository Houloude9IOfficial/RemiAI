*This README.md was created and edited from scratch by RemiAI. The project is pretty simple and was a test to what the AI could achieve through the tools given.*

# **Service Monitor CLI**  
*A Node.js CLI tool to check the heartbeat of web services with a user-friendly interface.*

---

## **📦 Overview**  
This project was built to monitor the availability of popular web services (e.g., Epic Games, ChatGPT, Claude) via a command-line interface. It uses **Inquirer.js** for interactive menus and **Axios** for HTTP requests. The tool evolved through iterative improvements, addressing challenges like API restrictions and user experience enhancements.

---

## **🚀 Features**  
- **Interactive CLI**: Select services to check or monitor all at once.  
- **Real-Time Status**: Checks HTTP status codes and response times.  
- **Colorized Output**: Visual indicators for UP/DOWN statuses.  
- **Logging**: Saves results to `results.log` for historical tracking.  
- **Expanded Services**: Includes Google Cloud, GitHub, and Discord.  

---

## **🛠️ Behind-the-Scenes Journey**  

### **1. Initial Concept**  
The user requested a simple CLI to test service heartbeats. The first version used basic HTTP requests and Inquirer for selection.  

### **2. Challenges & Solutions**  
- **403 Forbidden Errors**:  
  Services like Claude and ChatGPT blocked automated requests. **Solution**: Added a browser-like `User-Agent` header to mimic real clients.  
- **Unreliable Endpoints**:  
  Google’s initial endpoint (`/generate_204`) wasn’t suitable. **Solution**: Switched to Google Cloud’s official status API.  
- **ESM Compatibility**:  
  Inquirer v9+ requires ES Modules. **Solution**: Converted the project to use `import/export` syntax.  

### **3. Iterative Improvements**  
- **Colorized Output**: Used `chalk` for visual clarity.  
- **Logging**: Added file logging to track historical data.  
- **Service Expansion**: Included more services based on user input.  

---

## **📂 Project Structure**  
```
service-monitor/
├── package.json       # Dependencies and scripts
├── index.js           # Main CLI logic
├── checker.js         # Service checking utility
├── services.js        # List of monitored services
└── results.log        # Auto-generated log file
```

---

## **🚦 Usage**  
1. **Install dependencies**:  
   ```bash
   npm install
   ```
2. **Run the CLI**:  
   ```bash
   npm start
   ```
3. **Select a service** and view results.  

---

## **🧠 Thought Process**  
- **User-Centric Design**: Prioritized intuitive menus and clear output.  
- **Problem-Solving**: Diagnosed HTTP errors and adapted endpoints.  
- **Modularity**: Separated concerns (service list, checker logic, UI).  
- **Iterative Development**: Added features incrementally based on testing.  

---

## **🤝 Contributions**  
Built by **Nicolas H.** with the assistance of **RemiAI** (me!). This project demonstrates how AI can collaborate with developers to refine ideas, solve technical challenges, and deliver functional tools.  

---

## **🔧 Future Enhancements**  
- **Notifications**: Email/Slack alerts for downtimes.  
- **Web Dashboard**: Visualize status history.  
- **Continuous Monitoring**: `watch` mode for real-time checks.  
