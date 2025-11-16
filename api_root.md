Title: Introduction | Plugin API

URL Source: https://developer.eagle.cool/plugin-api/

Published Time: Sun, 16 Nov 2025 02:46:04 GMT

Markdown Content:
1.   [Getting Started](https://developer.eagle.cool/plugin-api/get-started)

Introduction
------------

This document aims to provide a comprehensive and easy-to-understand guide for developers who want to use the Eagle Plugin API to develop plugins.

Hello and Welcome to the Eagle Plugin API. By using our API, developers can easily expand the functionality of Eagle applications. We hope that by providing an open API, we can give developers more creative space to enrich the plugin ecosystem of Eagle applications.

* * *

First, let's introduce the four types of Eagle plugins:

1.   **Window Plugin** These plugin are executed when the user clicks on them and open a plugin window. These plugins can provide interactive functionality with the user. 
2.   **Background Service Plugin** These plugin automatically open in the background as the application starts up and reside in the system background. 
3.   **Format Extension Plugin** These plugin are used to enhance or extend file formats that Eagle applications do not support, including thumbnail displays, display tools, etc. These plugins allow users to open more file formats in Eagle applications, such as new image or video formats. 
4.   **Inspector Extension Plugin** Enhances the functionality of the Eagle right-side inspector, allowing it to display corresponding data information for different file formats, such as additional attributes, previews, maps, EXIF information, and more. 

Each of the above four types of plugins has its own purpose and characteristics. Depending on your needs, you can choose different types of plugins to achieve the desired functionality.

* * *

Eagle Plugin is developed based on Web technology, using JavaScript language. By using the API, developers can create their own plugins and use Web technologies such as HTML, CSS, and JavaScript to extend the browser's functionality.

In addition, the Eagle Plugin API is not affected by cross-domain restrictions (CORS), so it can access any URL. This feature is very useful because it allows plugins to access multiple different data sources, thus achieving more functionality.

Currently, the Eagle Plugin API is based on Chromium 107 and Node 16, so there is no need to consider webpage compatibility issues. Developers can use the latest Web technologies with confidence without worrying about compatibility issues on different browsers or operating systems.

* * *

Eagle Plugin is a very powerful Web development plugin that not only supports various Web technologies but also supports Node.js native API and importing third-party modules. With these features, Eagle Plugin can help developers avoid reinventing the wheel while greatly improving development speed.

Support for Node.js native API. This means that developers can use various built-in features of Node.js, such as file systems, network operations, operating system services, etc. These features enable the application to perform more complex tasks, such as reading and writing files, processing network requests, implementing scheduled tasks, etc.

Support for importing third-party modules. This means that developers can directly use community-provided modules without having to reinvent the wheel themselves. This way, developers can focus more on implementing business logic without wasting time on repeating basic functionality.

Learn MoreÅF

* * *

In addition to supporting the native Web/Node.js API, Eagle plugins can also use the plugin API provided by the Eagle application to access files and data in the application. This makes it easier to meet various requirements, such as:

1.   **Retrieve saved files** Retrieve the currently saved file and folder data in the Eagle application. This way, developers can easily access files and folders in the Eagle application and perform more operations. 
2.   **Add or modify files** Add and modify data saved in the Eagle application. Developers can use this feature to add or modify data in the Eagle application and automatically save it. 
3.   **Adjust plugin window** Adjust the width, height, position, and top of the Eagle application window. This way, developers can customize the interface of the Eagle application to better meet their needs. 
4.   **Use the clipboard** Such as file copying and pasting. Developers can use these features to copy and paste files and other operations in the Eagle application to improve work efficiency. 

In summary, the Eagle Plugin API provides a variety of features that allow developers to develop the applications they

* * *

Although there are still many shortcomings in the Eagle plugin system, we are constantly working to improve it. If you have any ideas or suggestions, we very much welcome your feedback. Please contact us and let us work together to improve the plugin system and provide a better experience for users.

We look forward to your participation in building an even better plugin ecosystem!

Last updated 1 year ago

