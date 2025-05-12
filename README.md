# Project Description
We imagine that there are mobile wireless chargers (MWbot) capable of autonomously moving under electric cars to charge them by induction. This opens up a flexible charging management system where users can leave their car parked and request it to be charged while they run errands. When the car battery reaches the percentage of charge requested by the user, the MWbot can move to charge other cars. It is assumed that the MWbot can recognize the car model to be charged and specifically the capacity in kW of the battery. In addition, each parking space is equipped with sensors to monitor occupancy. The goal of the project is the design and implementation of a management system for a smart parking lot equipped with MWbots; for simplicity, we can assume the presence of a single MWbot within the parking lot. The system users are of three types: basic users who use the parking and charging services, premium users who can additionally book in advance, and the administrator who can remotely monitor the various components of the system and the occupancy status of the parking lot.

## General Structure
The project consists of these interconnected structures:

1. The main server, "app.js", has the task of managing Routes, displaying and correctly redirecting the user to the desired pages, called "views". These use the EJS format to inline JavaScript code in HTML, useful for simplifying and optimizing content display. Specifically, referring to the Main server in app.js, two NodeJS modules were used to interact with services: Axios and CORS.

2. Axios allows sending REST requests, useful in our case to communicate with API services, making it easy to format the request in the desired method.

3. CORS, on the other hand, comes into play when a client requests a resource from a different domain, protocol, or port. It allows sending JavaScript data to the client securely. This way, it's possible to more easily exchange information between the various parts that make up the project, making it more modular.

4. The API services, contained in the "services" folder, perform most of the operations and calculations, making the main server much lighter. These services will almost always interface with the database. The API services are divided as follows:

  - API Gateway: to facilitate the implementation of APIs and their invocation in the Main Server. This service correctly redirects requests, replacing the address used with that of the service requested in the URL path. Obviously, in case of malfunction, it is sufficient to replace the API Gateway address in the server with the address of the requested service.
  - Parking Service: manages all calculations and database insertions related to parking, between reservations and immediate parking. It also takes care of updating the table of occupied spaces in the parking lot, assigning penalties when necessary.
  - Charging Service: is the interface that starts and manages the robot and light bulbs controller. Through its Routes, an Admin user can stop or restart the MWbot. The latter is still started as soon as the program is started and awaits cars to be recharged.
  - Payment Service: manages the various payments present in the program, such as payment for upgrade to premium, parking payment, and penalties. It uses the PayPal API to simplify the payment process for the user with a familiar interface. Confirmation of payment is then saved and inserted into the database.
  - Auth Service: manages user login and registration. To make registration and login as simple as possible for users, in addition to standard login and registration, OAuth2.0 has been implemented with login and registration with your Google account. In normal login and registration, the password is encrypted using the bcrypt algorithm and salt, and then stored in the database.

5. The Database, contained in the "pissir.db" file and written in SQLite, was chosen for the project as it provides the right complexity and lightweight execution. The 5 tables that compose it can be identified: Payment, Space, Reservation, Prices, User. Refer to the following diagram for the various entities within them. To interface with the database, a special JavaScript file "db.js" was created inside the "models" folder, in which all the queries used during execution were created and saved. It is thus possible to recall the queries, using the appropriate functions that execute them.

6. Returning to the rest of the project components, as already mentioned in the Charging Service, two controllers have been implemented: the robot controller, which manages the queue and sends MQTT messages based on the state of the robot, and the controller for the light bulbs. The latter, contrary to the charge controller, is activated upon receiving MQTT messages to the specified topics. It implements the use of 3 different light bulbs, for 3 different tasks:
  - the first from the left: turns red when the robot is charging a car, green when the robot is free and has no cars in the queue to recharge, and yellow when the robot is moving, i.e., it is moving from one car to another.
  - the second bulb indicates the availability of spaces in the parking lot. It turns red when the parking lot is full, green when there are free spaces.
  - the third bulb manages the entry of cars into the parking lot. The light is red until a user completes payment for entry into the parking lot. At that point, the bulb will turn red for 30 seconds, allowing entry. Considering that a premium user arrives on time for their reservation (and has paid), the light will turn green for 30 seconds, allowing entry at the scheduled time.

7. Carefully implemented in the previous services and structures, MQTT is used for various tasks, divided in the topics:
  - robocharge/notification/#: in this topic, services and charge controller are able to send notifications directly to the users' web interface. In each message, the id of the user who must receive and view the message is specified, along with the title and description.
  - robocharge/charging/#: topic used in the backend that allows the parking service and charging service to communicate. The parking service publishes a new charging request on the topic, which is read by the charging service. The latter sends the necessary data to the charge controller, which will queue the vehicle for charging.
  - robocharge/status/#: this topic is used to put the Philips Hue light bulbs controller in communication with the rest of the services. Based on the message received, the controller will modify the color of the corresponding light bulb.

### Documentation of the various APIs created and implemented can be found while executing the project, by clicking the "Documentation" link in the footer of every page.


# Project Setup

### Installation of npm

 1. Download and install Node.js from the official website (https://nodejs.org/)
 2. The installation of Node.js automatically includes npm (Node Package Manager)
 3. Verify the installation by opening a terminal and typing npm -v


### Installation of Visual Studio Code

 1. Go to the official Visual Studio Code website (https://code.visualstudio.com/)
 2. Download the installer for your operating system (Windows, macOS, or Linux)
 3. Run the installer and follow the on-screen instructions
 4. When finished, launch Visual Studio Code


### Installation of Mosquitto (MQTT broker)

 - Windows:

    1. Download the installer from https://mosquitto.org/download/
    2. Run the installer and follow the instructions
    3. Add Mosquitto to the PATH environment variable


 - macOS:

    1. Use Homebrew: brew install mosquitto


 - Linux (Ubuntu/Debian):

    1. Run: sudo apt-get update
    2. Then: sudo apt-get install mosquitto mosquitto-clients

 - To start Mosquitto as a service, use:

    - Windows: Windows Services
    - Linux/macOS: sudo systemctl start mosquitto

 - Once mosquitto is installed, navigate to the installation path, enter the folder and open the "mosquitto.conf" file. Insert the following configuration lines at the beginning of the file:

 ` # Web Socket
   listener 9001
   protocol websockets
   allow_anonymous true
   #MQTT
   listener 1883
   protocol mqtt
   allow_anonymous true
 `

At this point, it is necessary to stop and restart the service to apply the new configurations. To do this in Windows, press the Windows key, and search for Services. At that point, a list of services running on the system will open. Find the 'Mosquitto Broker' service, right-click and stop it. Then right-click on the service again, and click on Start. Now the MQTT Broker will be correctly configured and the various clients can communicate.

## Philips Hue
 - To use Philips Hue light bulbs, simply download the following emulator: https://steveyo.github.io/Hue-Emulator/. Once the .zip file is downloaded, run the "HueEmulator-v0.8.jar" file. The port used in the project for the light bulbs is port 8000. At this point, the light bulbs will also be ready for use.

## .env file
 - In order to make the project work, the .env file needs to be added with your personal keys and secrets to access the various APIs.
   
  ` SESSION_SECRET='' -- add here your personal session secret
    JWT_SECRET='' -- add here your JWT token secret
    GOOGLE_CLIENT_ID='' -- add here your Google Cloud Console Client ID (https://console.cloud.google.com/auth/overview)
    GOOGLE_CLIENT_SECRET='' -- add here your Google Cloud Client Secret
    CALLBACK_URL='http://localhost:3001/auth/google/callback' -- this is the callback URL after the google authentication
    PAYPAL_CLIENT_ID='' -- add here your Paypal Client ID (https://developer.paypal.com/dashboard/)
    PAYPAL_CLIENT_SECRET='' ## add here your Paypal Client Secret
    PAYPAL_BASE_URL='https://api-m.sandbox.paypal.com'
    MQTT_BROKER='mqtt://localhost:1883' -- if you use a different port, change it
    MQTT_SOCKET_BROKER='ws://localhost:9001' -- if you use a different port, change it
  `

# How to Start the Project

 When starting the project, before running it, it is necessary to open the light bulb emulator and click on 'Start'. Finally, make sure that the Mosquitto Broker service is running. Once all the previous parts are installed, simply open Visual Studio Code in the project folder, open the terminal and type the command "npm start". This will start all services and the project will be running. Open any browser, and visit the page "localhost:8080/" to access the site. The database will start automatically on execution.
 To terminate the execution of the project, return to the Visual Studio Code terminal, press "Ctrl + C" and then the "S" key, then press Enter. The project will no longer be running.